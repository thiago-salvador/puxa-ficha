export async function confirmsNewsRefreshAcceptance(
  response: Response,
  expectedExecutionId: string,
  expectedCursor: number,
): Promise<boolean> {
  if (!response.ok) return false

  try {
    const body = (await response.json()) as {
      accepted?: unknown
      alreadyAccepted?: unknown
      workScheduled?: unknown
      state?: unknown
      executionId?: unknown
      cursor?: unknown
    }
    if (
      body.accepted !== true ||
      body.executionId !== expectedExecutionId ||
      body.cursor !== expectedCursor
    ) {
      return false
    }

    const newlyScheduled =
      body.alreadyAccepted === false &&
      body.workScheduled === true &&
      body.state === "processing"
    const completedAndRearmed =
      body.alreadyAccepted === true &&
      body.workScheduled === false &&
      body.state === "completed"
    return newlyScheduled || completedAndRearmed
  } catch {
    return false
  }
}
