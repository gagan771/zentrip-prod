import { FeaturePlaceholder } from '../../components/FeaturePlaceholder';

export default function BuddyScreen() {
  return (
    <FeaturePlaceholder
      featureNumber="10"
      title="Travel Buddy & Group Matchmaking"
      phase="Phase 4"
      doc="10-travel-buddy-group-matchmaking.md"
      description="Matches solo travelers to compatible groups on dates, budget, pace, and interests. V1 matching is a deterministic weighted score, not ML. 18+ only."
    />
  );
}
