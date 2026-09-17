import type { Theme, HomeLocation, Application } from "../shared/model";
import { Scene } from "./Scene";
export function Atmosphere({
  theme,
  moving,
  home,
  applications,
  onCity,
}: {
  theme: Theme;
  moving: boolean;
  home: HomeLocation;
  applications: Application[];
  onCity: (city: Theme, ids: string[]) => void;
}) {
  return (
    <Scene
      theme={theme}
      moving={moving}
      home={home}
      applications={applications}
      onCity={onCity}
    />
  );
}
