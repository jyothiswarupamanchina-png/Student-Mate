package com.studypilot.backend.repository;

import com.studypilot.backend.model.SyllabusTopic;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SyllabusTopicRepository extends JpaRepository<SyllabusTopic, Long> {
    List<SyllabusTopic> findBySyllabusUnitId(Long unitId);
    long countBySyllabusUnitIdAndIsCompletedTrue(Long unitId);
}

