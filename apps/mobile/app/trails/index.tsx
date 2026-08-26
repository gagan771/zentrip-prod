import { FeaturePlaceholder } from '../../components/FeaturePlaceholder';

export default function TrailsScreen() {
  return (
    <FeaturePlaceholder
      featureNumber="11"
      title="Zentrip Trails"
      phase="Phase 5"
      doc="11-zentrip-trails.md"
      description="Offline trekking maps (MapLibre + PMTiles), GPX routes, and confidence-tagged hazard reports. Requires expo-dev-client, not Expo Go, once map rendering lands — this placeholder is Expo-Go-safe."
    />
  );
}
