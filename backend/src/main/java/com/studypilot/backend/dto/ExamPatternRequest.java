package com.studypilot.backend.dto;

import java.util.List;

public class ExamPatternRequest {
    private String name;
    private boolean isDefault;
    private List<ComponentDto> components;

    // ── Inner DTO ─────────────────────────────────────────────────────────────

    public static class ComponentDto {
        private String componentName;
        private double maxMarks;
        private int displayOrder;
        private boolean isCustom;

        public String getComponentName() { return componentName; }
        public void setComponentName(String componentName) { this.componentName = componentName; }
        public double getMaxMarks() { return maxMarks; }
        public void setMaxMarks(double maxMarks) { this.maxMarks = maxMarks; }
        public int getDisplayOrder() { return displayOrder; }
        public void setDisplayOrder(int displayOrder) { this.displayOrder = displayOrder; }
        public boolean isCustom() { return isCustom; }
        public void setCustom(boolean custom) { isCustom = custom; }
    }

    // ── Getters & Setters ─────────────────────────────────────────────────────

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean aDefault) { isDefault = aDefault; }
    public List<ComponentDto> getComponents() { return components; }
    public void setComponents(List<ComponentDto> components) { this.components = components; }
}

