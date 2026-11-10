package com.studypilot.backend.repository;

import com.studypilot.backend.model.SyllabusUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SyllabusUnitRepository extends JpaRepository<SyllabusUnit, Long> {
    List<SyllabusUnit> findByStudentIdAndSubjectIdOrderByUnitNumberAsc(Long studentId, String subjectId);
}

