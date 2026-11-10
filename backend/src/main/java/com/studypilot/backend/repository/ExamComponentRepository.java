package com.studypilot.backend.repository;

import com.studypilot.backend.model.ExamComponent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ExamComponentRepository extends JpaRepository<ExamComponent, Long> {
    List<ExamComponent> findByExamPatternIdOrderByDisplayOrderAsc(Long patternId);
}

