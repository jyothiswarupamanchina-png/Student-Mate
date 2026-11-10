package com.studypilot.backend.dto;

import java.time.LocalDate;

public class SubjectMarkRequest {
    private String subjectId;
    private Long componentId;           // nullable — can enter marks without linking a component
    private String componentNameSnapshot; // required — always store the display name
    private double obtainedMarks;
    private double maxMarks;
    private LocalDate examDate;
    private String notes;

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public String getSubjectId() { return subjectId; }
    public void setSubjectId(String subjectId) { this.subjectId = subjectId; }

    public Long getComponentId() { return componentId; }
    public void setComponentId(Long componentId) { this.componentId = componentId; }

    public String getComponentNameSnapshot() { return componentNameSnapshot; }
    public void setComponentNameSnapshot(String componentNameSnapshot) { this.componentNameSnapshot = componentNameSnapshot; }

    public double getObtainedMarks() { return obtainedMarks; }
    public void setObtainedMarks(double obtainedMarks) { this.obtainedMarks = obtainedMarks; }

    public double getMaxMarks() { return maxMarks; }
    public void setMaxMarks(double maxMarks) { this.maxMarks = maxMarks; }

    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate examDate) { this.examDate = examDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}

