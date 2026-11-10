package com.studypilot.backend.model;

import jakarta.persistence.*;

@Entity
@Table(name = "exam_components")
public class ExamComponent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pattern_id", nullable = false)
    private ExamPattern examPattern;

    @Column(name = "component_name", nullable = false, length = 100)
    private String componentName;

    @Column(name = "max_marks", nullable = false)
    private double maxMarks;

    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    @Column(name = "is_custom", nullable = false)
    private boolean isCustom = false;

    // ── Constructors ──────────────────────────────────────────────────────────

    public ExamComponent() {}

    public ExamComponent(ExamPattern examPattern, String componentName,
                         double maxMarks, int displayOrder, boolean isCustom) {
        this.examPattern = examPattern;
        this.componentName = componentName;
        this.maxMarks = maxMarks;
        this.displayOrder = displayOrder;
        this.isCustom = isCustom;
    }

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public Long getId() { return id; }

    public ExamPattern getExamPattern() { return examPattern; }
    public void setExamPattern(ExamPattern examPattern) { this.examPattern = examPattern; }

    public String getComponentName() { return componentName; }
    public void setComponentName(String componentName) { this.componentName = componentName; }

    public double getMaxMarks() { return maxMarks; }
    public void setMaxMarks(double maxMarks) { this.maxMarks = maxMarks; }

    public int getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(int displayOrder) { this.displayOrder = displayOrder; }

    public boolean isCustom() { return isCustom; }
    public void setCustom(boolean custom) { isCustom = custom; }
}

