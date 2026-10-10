import { Composition, Folder } from "remotion";
import { GaruVideo } from "./Garu";
import { FPS, TOTAL } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Folder name="Garu">
    <Composition id="Garu-9x16" component={GaruVideo} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    <Composition id="Garu-16x9" component={GaruVideo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
  </Folder>
);
