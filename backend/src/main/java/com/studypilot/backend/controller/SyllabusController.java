package com.studypilot.backend.controller;

import com.studypilot.backend.dto.SyllabusTopicRequest;
import com.studypilot.backend.dto.SyllabusUnitRequest;
import com.studypilot.backend.dto.SyllabusUnitResponse;
import com.studypilot.backend.model.Student;
import com.studypilot.backend.model.SyllabusTopic;
import com.studypilot.backend.model.SyllabusUnit;
import com.studypilot.backend.repository.StudentRepository;
import com.studypilot.backend.repository.SyllabusTopicRepository;
import com.studypilot.backend.repository.SyllabusUnitRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/syllabus")
@Transactional
public class SyllabusController {

    private final SyllabusUnitRepository unitRepo;
    private final SyllabusTopicRepository topicRepo;
    private final StudentRepository studentRepo;

    public SyllabusController(SyllabusUnitRepository unitRepo,
                               SyllabusTopicRepository topicRepo,
                               StudentRepository studentRepo) {
        this.unitRepo = unitRepo;
        this.topicRepo = topicRepo;
        this.studentRepo = studentRepo;
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Student currentStudent() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return studentRepo.findByEmail(email)
                .orElseThrow(() -> new java.util.NoSuchElementException("Student not found"));
    }

    // ── Unit CRUD ─────────────────────────────────────────────────────────────

    /** GET /api/syllabus/{subjectId}/units */
    @GetMapping("/{subjectId}/units")
    public List<SyllabusUnitResponse> getUnits(@PathVariable String subjectId) {
        Student student = currentStudent();
        return unitRepo.findByStudentIdAndSubjectIdOrderByUnitNumberAsc(student.getId(), subjectId)
                .stream().map(SyllabusUnitResponse::from).collect(Collectors.toList());
    }

    /** POST /api/syllabus/{subjectId}/units */
    @PostMapping("/{subjectId}/units")
    public ResponseEntity<SyllabusUnitResponse> createUnit(
            @PathVariable String subjectId, @RequestBody SyllabusUnitRequest req) {

        Student student = currentStudent();
        SyllabusUnit unit = new SyllabusUnit(student, subjectId,
                req.getUnitNumber(), req.getUnitTitle(), req.getDescription());
        return ResponseEntity.ok(SyllabusUnitResponse.from(unitRepo.save(unit)));
    }

    /** PUT /api/syllabus/{subjectId}/units/{unitId} */
    @PutMapping("/{subjectId}/units/{unitId}")
    public ResponseEntity<SyllabusUnitResponse> updateUnit(
            @PathVariable String subjectId, @PathVariable Long unitId,
            @RequestBody SyllabusUnitRequest req) {

        Student student = currentStudent();
        SyllabusUnit unit = unitRepo.findById(unitId)
                .filter(u -> u.getStudent().getId().equals(student.getId())
                        && u.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Unit not found"));

        if (req.getUnitTitle() != null) unit.setUnitTitle(req.getUnitTitle());
        if (req.getUnitNumber() > 0) unit.setUnitNumber(req.getUnitNumber());
        if (req.getDescription() != null) unit.setDescription(req.getDescription());

        return ResponseEntity.ok(SyllabusUnitResponse.from(unitRepo.save(unit)));
    }

    /** DELETE /api/syllabus/{subjectId}/units/{unitId} */
    @DeleteMapping("/{subjectId}/units/{unitId}")
    public ResponseEntity<Map<String, Object>> deleteUnit(
            @PathVariable String subjectId, @PathVariable Long unitId) {

        Student student = currentStudent();
        SyllabusUnit unit = unitRepo.findById(unitId)
                .filter(u -> u.getStudent().getId().equals(student.getId())
                        && u.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Unit not found"));

        unitRepo.delete(unit); // cascades to topics
        return ResponseEntity.ok(Map.of("deleted", true));
    }

    // ── Topic CRUD ────────────────────────────────────────────────────────────

    /** POST /api/syllabus/{subjectId}/units/{unitId}/topics */
    @PostMapping("/{subjectId}/units/{unitId}/topics")
    public ResponseEntity<SyllabusUnitResponse> addTopic(
            @PathVariable String subjectId, @PathVariable Long unitId,
            @RequestBody SyllabusTopicRequest req) {

        Student student = currentStudent();
        SyllabusUnit unit = unitRepo.findById(unitId)
                .filter(u -> u.getStudent().getId().equals(student.getId())
                        && u.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Unit not found"));

        SyllabusTopic topic = new SyllabusTopic(unit, req.getTopicTitle());
        topicRepo.save(topic);

        return ResponseEntity.ok(SyllabusUnitResponse.from(unitRepo.findById(unitId).orElseThrow()));
    }

    /** PUT /api/syllabus/{subjectId}/units/{unitId}/topics/{topicId} — rename or toggle completion */
    @PutMapping("/{subjectId}/units/{unitId}/topics/{topicId}")
    public ResponseEntity<SyllabusUnitResponse> updateTopic(
            @PathVariable String subjectId, @PathVariable Long unitId,
            @PathVariable Long topicId, @RequestBody SyllabusTopicRequest req) {

        Student student = currentStudent();
        SyllabusUnit unit = unitRepo.findById(unitId)
                .filter(u -> u.getStudent().getId().equals(student.getId())
                        && u.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Unit not found"));

        SyllabusTopic topic = topicRepo.findById(topicId)
                .filter(t -> t.getSyllabusUnit().getId().equals(unit.getId()))
                .orElseThrow(() -> new java.util.NoSuchElementException("Topic not found"));

        if (req.getTopicTitle() != null) topic.setTopicTitle(req.getTopicTitle());
        topic.setCompleted(req.isCompleted()); // also sets completedAt
        topicRepo.save(topic);

        return ResponseEntity.ok(SyllabusUnitResponse.from(unitRepo.findById(unitId).orElseThrow()));
    }

    /** DELETE /api/syllabus/{subjectId}/units/{unitId}/topics/{topicId} */
    @DeleteMapping("/{subjectId}/units/{unitId}/topics/{topicId}")
    public ResponseEntity<Map<String, Object>> deleteTopic(
            @PathVariable String subjectId, @PathVariable Long unitId,
            @PathVariable Long topicId) {

        Student student = currentStudent();
        SyllabusUnit unit = unitRepo.findById(unitId)
                .filter(u -> u.getStudent().getId().equals(student.getId())
                        && u.getSubjectId().equals(subjectId))
                .orElseThrow(() -> new java.util.NoSuchElementException("Unit not found"));

        SyllabusTopic topic = topicRepo.findById(topicId)
                .filter(t -> t.getSyllabusUnit().getId().equals(unit.getId()))
                .orElseThrow(() -> new java.util.NoSuchElementException("Topic not found"));

        topicRepo.delete(topic);
        return ResponseEntity.ok(Map.of("deleted", true));
    }

    /**
     * POST /api/syllabus/{subjectId}/upload-pdf
     * Receives raw syllabus text (extracted client-side via FileReader + PDF.js / Gemini parse).
     * Accepts JSON: { "units": [{ "unitNumber": 1, "unitTitle": "...", "topics": ["topic1", ...] }] }
     * This is a preview-then-save endpoint — it saves directly on call. Frontend shows preview first.
     */
    @PostMapping("/{subjectId}/upload-pdf")
    public ResponseEntity<List<SyllabusUnitResponse>> uploadParsedSyllabus(
            @PathVariable String subjectId,
            @RequestBody ParsedSyllabusPayload payload) {

        if (payload == null || payload.getUnits() == null || payload.getUnits().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        Student student = currentStudent();

        List<SyllabusUnitResponse> saved = payload.getUnits().stream().map(u -> {
            SyllabusUnit unit = new SyllabusUnit(student, subjectId,
                    u.getUnitNumber(), u.getUnitTitle(), null);
            unit = unitRepo.save(unit);
            SyllabusUnit finalUnit = unit;
            if (u.getTopics() != null) {
                for (String topicTitle : u.getTopics()) {
                    topicRepo.save(new SyllabusTopic(finalUnit, topicTitle));
                }
            }
            return SyllabusUnitResponse.from(unitRepo.findById(finalUnit.getId()).orElseThrow());
        }).collect(Collectors.toList());

        return ResponseEntity.ok(saved);
    }

    // ── Inner payload class for PDF upload ────────────────────────────────────

    public static class ParsedSyllabusPayload {
        private List<UnitPayload> units;

        public List<UnitPayload> getUnits() { return units; }
        public void setUnits(List<UnitPayload> units) { this.units = units; }

        public static class UnitPayload {
            private int unitNumber;
            private String unitTitle;
            private List<String> topics;

            public int getUnitNumber() { return unitNumber; }
            public void setUnitNumber(int unitNumber) { this.unitNumber = unitNumber; }
            public String getUnitTitle() { return unitTitle; }
            public void setUnitTitle(String unitTitle) { this.unitTitle = unitTitle; }
            public List<String> getTopics() { return topics; }
            public void setTopics(List<String> topics) { this.topics = topics; }
        }
    }
}

