import { useEffect, useRef } from 'react';
import { StageController } from './stage';
import { CropOverlay } from './CropOverlay';

export let stageController: StageController | null = null;

export function CanvasStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctl = new StageController(canvasRef.current!, hostRef.current!);
    stageController = ctl;
    return () => {
      ctl.dispose();
      stageController = null;
    };
  }, []);

  return (
    <div className="stage" ref={hostRef} data-testid="stage">
      <canvas ref={canvasRef} />
      <CropOverlay host={hostRef} />
    </div>
  );
}
