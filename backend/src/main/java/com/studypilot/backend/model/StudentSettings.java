package com.studypilot.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "student_settings")
public class StudentSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "student_id", nullable = false, unique = true)
    private Student student;

    /**
     * Performance threshold (percentage). Subjects scoring below this percentage
     * in any exam component trigger a friendly improvement message.
     * Default: 50 (percent).
     */
    @Column(name = "performance_threshold", nullable = false)
    private double performanceThreshold = 50.0;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    // ── Constructors ──────────────────────────────────────────────────────────

    public StudentSettings() {}

    public StudentSettings(Student student) {
        this.student = student;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public Long getId() { return id; }

    public Student getStudent() { return student; }
    public void setStudent(Student student) { this.student = student; }

    public double getPerformanceThreshold() { return performanceThreshold; }
    public void setPerformanceThreshold(double performanceThreshold) {
        this.performanceThreshold = performanceThreshold;
    }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
}

