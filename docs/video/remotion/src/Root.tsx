import { Composition, Folder } from "remotion";
import { GaruShort, GaruVideo } from "./Garu";
import { FPS, SHORT_TOTAL, TOTAL } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Folder name="Garu">
    <Composition id="Garu-9x16" component={GaruVideo} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    <Composition id="Garu-16x9" component={GaruVideo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="Garu-15s-9x16" component={GaruShort} durationInFrames={SHORT_TOTAL} fps={FPS} width={1080} height={1920} />
  </Folder>
);
