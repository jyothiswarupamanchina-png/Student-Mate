package com.studypilot.backend.dto;

import com.studypilot.backend.model.SubjectMark;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class SubjectMarkResponse {
    private Long id;
    private String subjectId;
    private Long componentId;
    private String componentNameSnapshot;
    private double obtainedMarks;
    private double maxMarks;
    private double percentage;
    private LocalDate examDate;
    private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static SubjectMarkResponse from(SubjectMark m) {
        SubjectMarkResponse dto = new SubjectMarkResponse();
        dto.id = m.getId();
        dto.subjectId = m.getSubjectId();
        dto.componentId = m.getExamComponent() != null ? m.getExamComponent().getId() : null;
        dto.componentNameSnapshot = m.getComponentNameSnapshot();
        dto.obtainedMarks = m.getObtainedMarks();
        dto.maxMarks = m.getMaxMarks();
        dto.percentage = m.getMaxMarks() > 0 ? (m.getObtainedMarks() / m.getMaxMarks()) * 100.0 : 0;
        dto.examDate = m.getExamDate();
        dto.notes = m.getNotes();
        dto.createdAt = m.getCreatedAt();
        dto.updatedAt = m.getUpdatedAt();
        return dto;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getSubjectId() { return subjectId; }
    public Long getComponentId() { return componentId; }
    public String getComponentNameSnapshot() { return componentNameSnapshot; }
    public double getObtainedMarks() { return obtainedMarks; }
    public double getMaxMarks() { return maxMarks; }
    public double getPercentage() { return percentage; }
    public LocalDate getExamDate() { return examDate; }
    public String getNotes() { return notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}

