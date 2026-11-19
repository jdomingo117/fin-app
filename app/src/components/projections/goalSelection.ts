import type { PlanningGoal } from '../../lib/planning'
import type { ProjectionMetric } from '../../lib/projections'

export function resolveProjectionGoal<T extends Pick<PlanningGoal, 'id' | 'status' | 'metric'>>(
  goals: T[],
  selectedGoalId: string | null | undefined,
  temporaryMeasure: ProjectionMetric,
) {
  // undefined asks for the default. null is an explicit choice of the calculator.
  const goal = selectedGoalId === null ? null
    : goals.find(candidate => candidate.id === selectedGoalId)
      ?? goals.find(candidate => candidate.status === 'active')
      ?? goals[0]
      ?? null
  const metric = goal ? (goal.metric === 'net_worth' ? 'netWorth' : 'cash') : temporaryMeasure
  return { goal, metric } as const
}
