package com.studypilot.backend.dto;

import com.studypilot.backend.model.ExamComponent;
import com.studypilot.backend.model.ExamPattern;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

public class ExamPatternResponse {
    private Long id;
    private String name;
    private boolean isDefault;
    private LocalDateTime createdAt;
    private List<ComponentDto> components;

    // ── Inner DTO ─────────────────────────────────────────────────────────────

    public static class ComponentDto {
        private Long id;
        private String componentName;
        private double maxMarks;
        private int displayOrder;
        private boolean isCustom;

        public static ComponentDto from(ExamComponent c) {
            ComponentDto dto = new ComponentDto();
            dto.id = c.getId();
            dto.componentName = c.getComponentName();
            dto.maxMarks = c.getMaxMarks();
            dto.displayOrder = c.getDisplayOrder();
            dto.isCustom = c.isCustom();
            return dto;
        }

        public Long getId() { return id; }
        public String getComponentName() { return componentName; }
        public double getMaxMarks() { return maxMarks; }
        public int getDisplayOrder() { return displayOrder; }
        public boolean isCustom() { return isCustom; }
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    public static ExamPatternResponse from(ExamPattern p) {
        ExamPatternResponse dto = new ExamPatternResponse();
        dto.id = p.getId();
        dto.name = p.getName();
        dto.isDefault = p.isDefault();
        dto.createdAt = p.getCreatedAt();
        dto.components = p.getComponents().stream()
                .map(ComponentDto::from)
                .collect(Collectors.toList());
        return dto;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getName() { return name; }
    public boolean isDefault() { return isDefault; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public List<ComponentDto> getComponents() { return components; }
}

