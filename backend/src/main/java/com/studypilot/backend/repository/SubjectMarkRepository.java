package com.studypilot.backend.repository;

import com.studypilot.backend.model.SubjectMark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface SubjectMarkRepository extends JpaRepository<SubjectMark, Long> {

    List<SubjectMark> findByStudentIdAndSubjectId(Long studentId, String subjectId);

    List<SubjectMark> findByStudentId(Long studentId);

    /** Count marks referencing a specific component — used before delete to warn user. */
    long countByExamComponentId(Long componentId);

    /** Null out component FK when a component is deleted; keeps the mark row intact. */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE SubjectMark sm SET sm.examComponent = null WHERE sm.examComponent.id = :componentId")
    void nullifyComponent(@Param("componentId") Long componentId);
}

