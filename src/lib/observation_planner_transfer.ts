export const PLANNER_SELECTION_KEY = "dwarfium-planner-selection-v1";

export type PlannerSkySelection = {
  name: string;
  rightAscension: string;
  declination: string;
  fovWidthDegrees: number;
  fovHeightDegrees: number;
};

export function savePlannerSkySelection(selection: PlannerSkySelection) {
  localStorage.setItem(PLANNER_SELECTION_KEY, JSON.stringify(selection));
}
