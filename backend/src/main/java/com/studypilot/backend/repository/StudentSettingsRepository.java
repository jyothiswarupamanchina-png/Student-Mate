package com.studypilot.backend.repository;

import com.studypilot.backend.model.StudentSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface StudentSettingsRepository extends JpaRepository<StudentSettings, Long> {
    Optional<StudentSettings> findByStudentId(Long studentId);
}

