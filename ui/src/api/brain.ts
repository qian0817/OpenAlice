export type BrainCommitType = 'frontal_lobe' | 'emotion'

export interface BrainCommit {
  hash: string
  parentHash: string | null
  timestamp: string
  type: BrainCommitType
  message: string
  stateAfter: { frontalLobe: string; emotion: string }
}

export interface BrainState {
  frontalLobe: string
  emotion: string
  commits: BrainCommit[]
}

export const brainApi = {
  async state(): Promise<BrainState> {
    const res = await fetch('/api/brain/state')
    if (!res.ok) throw new Error('Failed to load brain state')
    return res.json()
  },
}
