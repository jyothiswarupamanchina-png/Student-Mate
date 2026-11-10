package com.studypilot.backend.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "subject_marks")
public class SubjectMark {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    /**
     * Refers to the subject by its frontend-generated ID (string UUID stored in localStorage).
     * Not a foreign key — subjects live in localStorage, not in MySQL.
     */
    @Column(name = "subject_id", nullable = false, length = 100)
    private String subjectId;

    /**
     * Nullable: set to NULL when the component is deleted, but the mark row is KEPT.
     * componentNameSnapshot preserves the original name for historical display.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "component_id")
    private ExamComponent examComponent;

    /**
     * Snapshot of the component name at time of mark entry.
     * Preserved even if the component is later renamed or deleted.
     */
    @Column(name = "component_name_snapshot", nullable = false, length = 100)
    private String componentNameSnapshot;

    @Column(name = "obtained_marks", nullable = false)
    private double obtainedMarks;

    @Column(name = "max_marks", nullable = false)
    private double maxMarks;

    @Column(name = "exam_date")
    private LocalDate examDate;

    @Column(length = 500)
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    // ── Constructors ──────────────────────────────────────────────────────────

    public SubjectMark() {}

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public Long getId() { return id; }

    public Student getStudent() { return student; }
    public void setStudent(Student student) { this.student = student; }

    public String getSubjectId() { return subjectId; }
    public void setSubjectId(String subjectId) { this.subjectId = subjectId; }

    public ExamComponent getExamComponent() { return examComponent; }
    public void setExamComponent(ExamComponent examComponent) { this.examComponent = examComponent; }

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

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}

