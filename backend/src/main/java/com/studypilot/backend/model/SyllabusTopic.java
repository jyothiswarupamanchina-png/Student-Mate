package com.studypilot.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "syllabus_topics")
public class SyllabusTopic {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unit_id", nullable = false)
    private SyllabusUnit syllabusUnit;

    @Column(name = "topic_title", nullable = false, length = 300)
    private String topicTitle;

    @Column(name = "is_completed", nullable = false)
    private boolean isCompleted = false;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    // ── Constructors ──────────────────────────────────────────────────────────

    public SyllabusTopic() {}

    public SyllabusTopic(SyllabusUnit syllabusUnit, String topicTitle) {
        this.syllabusUnit = syllabusUnit;
        this.topicTitle = topicTitle;
    }

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public Long getId() { return id; }

    public SyllabusUnit getSyllabusUnit() { return syllabusUnit; }
    public void setSyllabusUnit(SyllabusUnit syllabusUnit) { this.syllabusUnit = syllabusUnit; }

    public String getTopicTitle() { return topicTitle; }
    public void setTopicTitle(String topicTitle) { this.topicTitle = topicTitle; }

    public boolean isCompleted() { return isCompleted; }
    public void setCompleted(boolean completed) {
        isCompleted = completed;
        completedAt = completed ? LocalDateTime.now() : null;
    }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
}

