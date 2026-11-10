package com.studypilot.backend.model;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "syllabus_units")
public class SyllabusUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    /**
     * Frontend-generated subject ID (string UUID from localStorage).
     * Not a FK — subjects live in localStorage, not MySQL.
     */
    @Column(name = "subject_id", nullable = false, length = 100)
    private String subjectId;

    @Column(name = "unit_number", nullable = false)
    private int unitNumber;

    @Column(name = "unit_title", nullable = false, length = 200)
    private String unitTitle;

    @Column(length = 1000)
    private String description;

    @OneToMany(mappedBy = "syllabusUnit", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("id ASC")
    private List<SyllabusTopic> topics = new ArrayList<>();

    // ── Constructors ──────────────────────────────────────────────────────────

    public SyllabusUnit() {}

    public SyllabusUnit(Student student, String subjectId,
                        int unitNumber, String unitTitle, String description) {
        this.student = student;
        this.subjectId = subjectId;
        this.unitNumber = unitNumber;
        this.unitTitle = unitTitle;
        this.description = description;
    }

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public Long getId() { return id; }

    public Student getStudent() { return student; }
    public void setStudent(Student student) { this.student = student; }

    public String getSubjectId() { return subjectId; }
    public void setSubjectId(String subjectId) { this.subjectId = subjectId; }

    public int getUnitNumber() { return unitNumber; }
    public void setUnitNumber(int unitNumber) { this.unitNumber = unitNumber; }

    public String getUnitTitle() { return unitTitle; }
    public void setUnitTitle(String unitTitle) { this.unitTitle = unitTitle; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public List<SyllabusTopic> getTopics() { return topics; }
    public void setTopics(List<SyllabusTopic> topics) { this.topics = topics; }
}

