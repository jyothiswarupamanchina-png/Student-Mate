package com.studypilot.backend.dto;

public class SyllabusUnitRequest {
    private int unitNumber;
    private String unitTitle;
    private String description;

    public int getUnitNumber() { return unitNumber; }
    public void setUnitNumber(int unitNumber) { this.unitNumber = unitNumber; }
    public String getUnitTitle() { return unitTitle; }
    public void setUnitTitle(String unitTitle) { this.unitTitle = unitTitle; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}

