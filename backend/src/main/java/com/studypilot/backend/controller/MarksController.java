package com.studypilot.backend.controller;

import com.studypilot.backend.dto.SubjectMarkRequest;
import com.studypilot.backend.dto.SubjectMarkResponse;
import com.studypilot.backend.model.ExamComponent;
import com.studypilot.backend.model.Student;
import com.studypilot.backend.model.StudentSettings;
import com.studypilot.backend.model.SubjectMark;
import com.studypilot.backend.repository.ExamComponentRepository;
import com.studypilot.backend.repository.StudentRepository;
import com.studypilot.backend.repository.StudentSettingsRepository;
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
@RequestMapping("/api/marks")
@Transactional
public class MarksController {

    private final SubjectMarkRepository markRepo;
    private final ExamComponentRepository componentRepo;
    private final StudentRepository studentRepo;
    private final StudentSettingsRepository settingsRepo;

    public MarksController(SubjectMarkRepository markRepo,
                           ExamComponentRepository componentRepo,
                           StudentRepository studentRepo,
                           StudentSettingsRepository settingsRepo) {
        this.markRepo = markRepo;
        this.componentRepo = componentRepo;
        this.studentRepo = studentRepo;
        this.settingsRepo = settingsRepo;
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Student currentStudent() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return studentRepo.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));
    }

    // ── Endpoints ─────────────────────────────────────────────────────────────

    /** GET /api/marks/{subjectId} — all marks for a subject */
    @GetMapping("/{subjectId}")
    public List<SubjectMarkResponse> getMarks(@PathVariable String subjectId) {
        Student student = currentStudent();
        return markRepo.findByStudentIdAndSubjectId(student.getId(), subjectId).stream()
                .map(SubjectMarkResponse::from)
                .collect(Collectors.toList());
    }

    /** GET /api/marks — all marks across all subjects for the current student */
    @GetMapping
    public List<SubjectMarkResponse> getAllMarks() {
        Student student = currentStudent();
        return markRepo.findByStudentId(student.getId()).stream()
                .map(SubjectMarkResponse::from)
                .collect(Collectors.toList());
    }

    /** POST /api/marks/{subjectId} — save a new mark entry */
    @PostMapping("/{subjectId}")
    public ResponseEntity<SubjectMarkResponse> saveMark(
            @PathVariable String subjectId, @RequestBody SubjectMarkRequest req) {

        Student student = currentStudent();

        if (req.getObtainedMarks() < 0) {
            return ResponseEntity.badRequest().build();
        }

        SubjectMark mark = new SubjectMark();
        mark.setStudent(student);
        mark.setSubjectId(subjectId);
        mark.setObtainedMarks(req.getObtainedMarks());
        mark.setMaxMarks(req.getMaxMarks());
        mark.setExamDate(req.getExamDate());
        mark.setNotes(req.getNotes());

        // Link component if provided — strictly verify component belongs to the current student's pattern
        if (req.getComponentId() != null) {
            ExamComponent component = componentRepo.findById(req.getComponentId())
                    .filter(c -> c.getExamPattern() != null
                            && c.getExamPattern().getStudent() != null
                            && c.getExamPattern().getStudent().getId().equals(student.getId()))
                    .orElse(null);
            if (component == null) {
                // Reject cross-tenant foreign component linking (IDOR defense)
                return ResponseEntity.status(403).build();
            }
            mark.setExamComponent(component);
            if (mark.getMaxMarks() <= 0) {
                mark.setMaxMarks(component.getMaxMarks());
            }
            if (req.getComponentNameSnapshot() == null || req.getComponentNameSnapshot().isBlank()) {
                mark.setComponentNameSnapshot(component.getComponentName());
            }
        }
        if (mark.getComponentNameSnapshot() == null || mark.getComponentNameSnapshot().isBlank()) {
            mark.setComponentNameSnapshot(
                    req.getComponentNameSnapshot() != null ? req.getComponentNameSnapshot() : "Manual Entry");
        }

        mark = markRepo.save(mark);
        return ResponseEntity.ok(SubjectMarkResponse.from(mark));
    }

    /** PUT /api/marks/{subjectId}/{markId} — update an existing mark */
    @PutMapping("/{subjectId}/{markId}")
    public ResponseEntity<SubjectMarkResponse> updateMark(
            @PathVariable String subjectId, @PathVariable Long markId,
            @RequestBody SubjectMarkRequest req) {

        Student student = currentStudent();

        if (req.getObtainedMarks() < 0) {
            return ResponseEntity.badRequest().build();
        }

        SubjectMark mark = markRepo.findById(markId)
                .filter(m -> m.getStudent().getId().equals(student.getId())
                        && m.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Mark not found"));

        mark.setObtainedMarks(req.getObtainedMarks());
        mark.setMaxMarks(req.getMaxMarks());
        if (req.getExamDate() != null) mark.setExamDate(req.getExamDate());
        if (req.getNotes() != null) mark.setNotes(req.getNotes());
        if (req.getComponentNameSnapshot() != null)
            mark.setComponentNameSnapshot(req.getComponentNameSnapshot());

        if (req.getComponentId() != null) {
            ExamComponent component = componentRepo.findById(req.getComponentId())
                    .filter(c -> c.getExamPattern() != null
                            && c.getExamPattern().getStudent() != null
                            && c.getExamPattern().getStudent().getId().equals(student.getId()))
                    .orElse(null);
            if (component == null) {
                return ResponseEntity.status(403).build();
            }
            mark.setExamComponent(component);
        }

        return ResponseEntity.ok(SubjectMarkResponse.from(markRepo.save(mark)));
    }

    /** DELETE /api/marks/{subjectId}/{markId} — delete a single mark entry */
    @DeleteMapping("/{subjectId}/{markId}")
    public ResponseEntity<Map<String, Object>> deleteMark(
            @PathVariable String subjectId, @PathVariable Long markId) {

        Student student = currentStudent();
        SubjectMark mark = markRepo.findById(markId)
                .filter(m -> m.getStudent().getId().equals(student.getId())
                        && m.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Mark not found"));

        markRepo.delete(mark);
        return ResponseEntity.ok(Map.of("deleted", true));
    }

    /**
     * GET /api/marks/{subjectId}/performance — per-component summary with threshold flag.
     * Returns list of {componentNameSnapshot, obtainedMarks, maxMarks, percentage, belowThreshold}.
     * Uses saved student threshold or default of 50%.
     */
    @GetMapping("/{subjectId}/performance")
    public List<Map<String, Object>> getPerformance(
            @PathVariable String subjectId,
            @RequestParam(required = false) Double threshold) {

        Student student = currentStudent();
        double effectiveThreshold = (threshold != null)
                ? threshold
                : settingsRepo.findByStudentId(student.getId())
                        .map(StudentSettings::getPerformanceThreshold)
                        .orElse(50.0);

        return markRepo.findByStudentIdAndSubjectId(student.getId(), subjectId).stream()
                .map(m -> {
                    double pct = m.getMaxMarks() > 0
                            ? (m.getObtainedMarks() / m.getMaxMarks()) * 100.0 : 0;
                    boolean below = pct < effectiveThreshold;
                    String message = below
                            ? "You scored " + String.format("%.1f", pct) + "% in " +
                              m.getComponentNameSnapshot() + ". Keep going — a little more focus here will make a big difference! 💪"
                            : "Great work in " + m.getComponentNameSnapshot() + "! 🎉";
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("markId", m.getId());
                    entry.put("componentNameSnapshot", m.getComponentNameSnapshot());
                    entry.put("obtainedMarks", m.getObtainedMarks());
                    entry.put("maxMarks", m.getMaxMarks());
                    entry.put("percentage", pct);
                    entry.put("belowThreshold", below);
                    entry.put("message", message);
                    return entry;
                })
                .collect(Collectors.toList());
    }
}
