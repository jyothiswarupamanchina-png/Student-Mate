package com.studypilot.backend.repository;

import com.studypilot.backend.model.ExamPattern;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ExamPatternRepository extends JpaRepository<ExamPattern, Long> {
    List<ExamPattern> findByStudentId(Long studentId);
    List<ExamPattern> findByStudentIdAndIsDefaultTrue(Long studentId);
}

