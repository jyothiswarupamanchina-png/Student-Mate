package com.studypilot.backend.controller;

import com.studypilot.backend.model.Student;
import com.studypilot.backend.model.StudentSettings;
import com.studypilot.backend.repository.StudentRepository;
import com.studypilot.backend.repository.StudentSettingsRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/settings")
@Transactional
public class StudentSettingsController {

    private final StudentSettingsRepository settingsRepo;
    private final StudentRepository studentRepo;

    public StudentSettingsController(StudentSettingsRepository settingsRepo,
                                     StudentRepository studentRepo) {
        this.settingsRepo = settingsRepo;
        this.studentRepo = studentRepo;
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Student currentStudent() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return studentRepo.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Student not found"));
    }

    private StudentSettings getOrCreate(Student student) {
        return settingsRepo.findByStudentId(student.getId())
                .orElseGet(() -> settingsRepo.save(new StudentSettings(student)));
    }

    // ── Endpoints ─────────────────────────────────────────────────────────────

    /** GET /api/settings — returns current student settings */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getSettings() {
        Student student = currentStudent();
        StudentSettings settings = getOrCreate(student);
        return ResponseEntity.ok(Map.of(
                "id", settings.getId(),
                "performanceThreshold", settings.getPerformanceThreshold(),
                "updatedAt", settings.getUpdatedAt().toString()
        ));
    }

    /** PUT /api/settings — update performance threshold */
    @PutMapping
    public ResponseEntity<Map<String, Object>> updateSettings(
            @RequestBody Map<String, Object> body) {

        Student student = currentStudent();
        StudentSettings settings = getOrCreate(student);

        if (body.containsKey("performanceThreshold")) {
            double threshold;
            try {
                threshold = Double.parseDouble(body.get("performanceThreshold").toString());
            } catch (NumberFormatException | NullPointerException e) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "performanceThreshold must be a valid number between 0 and 100"));
            }
            if (threshold < 0 || threshold > 100) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "performanceThreshold must be between 0 and 100"));
            }
            settings.setPerformanceThreshold(threshold);
        }

        settings = settingsRepo.save(settings);
        return ResponseEntity.ok(Map.of(
                "id", settings.getId(),
                "performanceThreshold", settings.getPerformanceThreshold(),
                "updatedAt", settings.getUpdatedAt().toString()
        ));
    }
}

