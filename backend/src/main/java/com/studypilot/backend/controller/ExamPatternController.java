package com.studypilot.backend.controller;

import com.studypilot.backend.dto.ExamPatternRequest;
import com.studypilot.backend.dto.ExamPatternResponse;
import com.studypilot.backend.model.ExamComponent;
import com.studypilot.backend.model.ExamPattern;
import com.studypilot.backend.model.Student;
import com.studypilot.backend.repository.ExamComponentRepository;
import com.studypilot.backend.repository.ExamPatternRepository;
import com.studypilot.backend.repository.StudentRepository;
import com.studypilot.backend.repository.SubjectMarkRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/exam-patterns")
@Transactional
public class ExamPatternController {

    private final ExamPatternRepository patternRepo;
    private final ExamComponentRepository componentRepo;
    private final SubjectMarkRepository markRepo;
    private final StudentRepository studentRepo;

    public ExamPatternController(ExamPatternRepository patternRepo,
                                 ExamComponentRepository componentRepo,
                                 SubjectMarkRepository markRepo,
                                 StudentRepository studentRepo) {
        this.patternRepo = patternRepo;
        this.componentRepo = componentRepo;
        this.markRepo = markRepo;
        this.studentRepo = studentRepo;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Student currentStudent() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return studentRepo.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));
    }

    // ── Exam Pattern CRUD ─────────────────────────────────────────────────────

    /** GET /api/exam-patterns — list all patterns for the current student */
    @GetMapping
    public List<ExamPatternResponse> listPatterns() {
        Student student = currentStudent();
        return patternRepo.findByStudentId(student.getId()).stream()
                .map(ExamPatternResponse::from)
                .collect(Collectors.toList());
    }

    /** POST /api/exam-patterns — create a new pattern (with optional components) */
    @PostMapping
    public ResponseEntity<ExamPatternResponse> createPattern(
            @RequestBody ExamPatternRequest req) {

        Student student = currentStudent();

        // If this is marked as default, unset existing defaults first
        if (req.isDefault()) {
            patternRepo.findByStudentIdAndIsDefaultTrue(student.getId())
                    .forEach(p -> { p.setDefault(false); patternRepo.save(p); });
        }

        ExamPattern pattern = new ExamPattern(student, req.getName(), req.isDefault());
        pattern = patternRepo.save(pattern);

        // Add components if provided
        if (req.getComponents() != null) {
            ExamPattern finalPattern = pattern;
            List<ExamComponent> components = req.getComponents().stream().map(c -> {
                ExamComponent ec = new ExamComponent(finalPattern, c.getComponentName(),
                        c.getMaxMarks(), c.getDisplayOrder(), c.isCustom());
                return ec;
            }).collect(Collectors.toList());
            componentRepo.saveAll(components);
            pattern.setComponents(components);
        }

        return ResponseEntity.ok(ExamPatternResponse.from(pattern));
    }

    /** PUT /api/exam-patterns/{id} — rename or toggle default */
    @PutMapping("/{id}")
    public ResponseEntity<ExamPatternResponse> updatePattern(
            @PathVariable Long id, @RequestBody ExamPatternRequest req) {

        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        if (req.getName() != null) pattern.setName(req.getName());

        if (req.isDefault() && !pattern.isDefault()) {
            patternRepo.findByStudentIdAndIsDefaultTrue(student.getId())
                    .forEach(p -> { p.setDefault(false); patternRepo.save(p); });
            pattern.setDefault(true);
        }

        return ResponseEntity.ok(ExamPatternResponse.from(patternRepo.save(pattern)));
    }

    /** DELETE /api/exam-patterns/{id} — delete pattern (warns if marks exist via markCount) */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deletePattern(@PathVariable Long id) {
        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        // Count marks linked to any component of this pattern
        long markCount = pattern.getComponents().stream()
                .mapToLong(c -> markRepo.countByExamComponentId(c.getId()))
                .sum();

        Map<String, Object> body = new LinkedHashMap<>();
        if (markCount > 0) {
            body.put("requiresConfirmation", true);
            body.put("markCount", markCount);
            body.put("message", "This pattern has " + markCount +
                    " saved marks. Deleting the pattern will orphan these marks (component link will be removed but marks are kept). " +
                    "Send DELETE with ?confirm=true to proceed.");
            return ResponseEntity.status(409).body(body);
        }

        patternRepo.delete(pattern);
        body.put("deleted", true);
        return ResponseEntity.ok(body);
    }

    /** DELETE /api/exam-patterns/{id}?confirm=true — force-delete with orphan handling */
    @DeleteMapping(value = "/{id}", params = "confirm")
    public ResponseEntity<Map<String, Object>> deletePatternConfirmed(
            @PathVariable Long id, @RequestParam boolean confirm) {

        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        if (confirm) {
            // Null out component FK on all marks belonging to these components
            pattern.getComponents().forEach(c -> markRepo.nullifyComponent(c.getId()));
            patternRepo.delete(pattern);
            Map<String, Object> body = Map.of("deleted", true, "marksOrphaned", true);
            return ResponseEntity.ok(body);
        }

        return ResponseEntity.badRequest().body(Map.of("error", "confirm must be true"));
    }

    // ── Component CRUD ────────────────────────────────────────────────────────

    /** POST /api/exam-patterns/{id}/components — add a component */
    @PostMapping("/{id}/components")
    public ResponseEntity<ExamPatternResponse> addComponent(
            @PathVariable Long id, @RequestBody ExamPatternRequest.ComponentDto req) {

        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        ExamComponent c = new ExamComponent(pattern, req.getComponentName(),
                req.getMaxMarks(), req.getDisplayOrder(), req.isCustom());
        componentRepo.save(c);

        return ResponseEntity.ok(ExamPatternResponse.from(patternRepo.findById(id).orElseThrow()));
    }

    /** PUT /api/exam-patterns/{id}/components/{cid} — update component */
    @PutMapping("/{id}/components/{cid}")
    public ResponseEntity<ExamPatternResponse> updateComponent(
            @PathVariable Long id, @PathVariable Long cid,
            @RequestBody ExamPatternRequest.ComponentDto req) {

        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        ExamComponent c = componentRepo.findById(cid)
                .filter(ec -> ec.getExamPattern().getId().equals(pattern.getId()))
                .orElseThrow(() -> new RuntimeException("Component not found"));

        if (req.getComponentName() != null) c.setComponentName(req.getComponentName());
        if (req.getMaxMarks() > 0) c.setMaxMarks(req.getMaxMarks());
        c.setDisplayOrder(req.getDisplayOrder());
        componentRepo.save(c);

        return ResponseEntity.ok(ExamPatternResponse.from(patternRepo.findById(id).orElseThrow()));
    }

    /** DELETE /api/exam-patterns/{id}/components/{cid} — delete component (warns if marks exist) */
    @DeleteMapping("/{id}/components/{cid}")
    public ResponseEntity<Map<String, Object>> deleteComponent(
            @PathVariable Long id, @PathVariable Long cid) {

        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        ExamComponent c = componentRepo.findById(cid)
                .filter(ec -> ec.getExamPattern().getId().equals(pattern.getId()))
                .orElseThrow(() -> new RuntimeException("Component not found"));

        long markCount = markRepo.countByExamComponentId(cid);
        Map<String, Object> body = new LinkedHashMap<>();

        if (markCount > 0) {
            body.put("requiresConfirmation", true);
            body.put("markCount", markCount);
            body.put("message", markCount + " mark(s) reference this component. " +
                    "Deleting will orphan them (component_name_snapshot preserved). " +
                    "Send DELETE with ?confirm=true to proceed.");
            return ResponseEntity.status(409).body(body);
        }

        componentRepo.delete(c);
        body.put("deleted", true);
        return ResponseEntity.ok(body);
    }

    /** DELETE /api/exam-patterns/{id}/components/{cid}?confirm=true */
    @DeleteMapping(value = "/{id}/components/{cid}", params = "confirm")
    public ResponseEntity<Map<String, Object>> deleteComponentConfirmed(
            @PathVariable Long id, @PathVariable Long cid, @RequestParam boolean confirm) {

        Student student = currentStudent();
        ExamPattern pattern = patternRepo.findById(id)
                .filter(p -> p.getStudent().getId().equals(student.getId()))
                .orElseThrow(() -> new RuntimeException("Pattern not found"));

        ExamComponent c = componentRepo.findById(cid)
                .filter(ec -> ec.getExamPattern().getId().equals(pattern.getId()))
                .orElseThrow(() -> new RuntimeException("Component not found"));

        if (confirm) {
            markRepo.nullifyComponent(cid);
            componentRepo.delete(c);
            return ResponseEntity.ok(Map.of("deleted", true, "marksOrphaned", true));
        }

        return ResponseEntity.badRequest().body(Map.of("error", "confirm must be true"));
    }

    /** POST /api/exam-patterns/seed-default — creates standard default patterns for the student (Theory & Lab) */
    @PostMapping("/seed-default")
    public ResponseEntity<List<ExamPatternResponse>> seedDefault() {
        Student student = currentStudent();

        // Only seed if no patterns exist yet
        if (!patternRepo.findByStudentId(student.getId()).isEmpty()) {
            return ResponseEntity.status(409)
                    .body(null); // already has patterns
        }

        // 1. Theory Examination Pattern (FA1 & FA2 for Mid 1, FA3 & FA4 for Mid 2, CLA, Mid exams, Semester End)
        ExamPattern theory = new ExamPattern(student, "Theory Examination Pattern", true);
        theory = patternRepo.save(theory);

        String[] theoryNames = {
                "FA1 (Mid 1)", "FA2 (Mid 1)", "Mid 1 Examination",
                "FA3 (Mid 2)", "FA4 (Mid 2)", "Mid 2 Examination",
                "CLA (Continuous Learning Assessment)", "Semester End Theory Exam"
        };
        double[] theoryMarks = {10, 10, 30, 10, 10, 30, 20, 70};

        ExamPattern finalTheory = theory;
        for (int i = 0; i < theoryNames.length; i++) {
            ExamComponent c = new ExamComponent(finalTheory, theoryNames[i], theoryMarks[i], i, false);
            componentRepo.save(c);
        }

        // 2. Laboratory Examination Pattern (Lab internal and external separate)
        ExamPattern lab = new ExamPattern(student, "Laboratory Examination Pattern", false);
        lab = patternRepo.save(lab);

        String[] labNames = {
                "Lab Internal Assessment",
                "Day-to-Day Practical Record & Viva",
                "Lab External Practical Exam"
        };
        double[] labMarks = {25, 25, 50};

        ExamPattern finalLab = lab;
        for (int i = 0; i < labNames.length; i++) {
            ExamComponent c = new ExamComponent(finalLab, labNames[i], labMarks[i], i, false);
            componentRepo.save(c);
        }

        List<ExamPatternResponse> all = patternRepo.findByStudentId(student.getId()).stream()
                .map(ExamPatternResponse::from)
                .collect(Collectors.toList());

        return ResponseEntity.ok(all);
    }
}

