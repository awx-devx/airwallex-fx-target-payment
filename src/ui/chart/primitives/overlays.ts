import type {
  AutoscaleInfo,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { ChartColors } from '@/ui/chart/theme';
import { withAlpha } from '@/ui/chart/theme';

export interface TimeSpan {
  from: number;
  to: number;
}

export interface OverlayModel {
  inverted: boolean;
  target?: number;
  entry?: number;
  zone: boolean;
  deadline: number;
  due: number;
  now: number;
  deadlineLabel: string;
  dueLabel: string;
  deadlineToday: boolean;
  deadlinePassed: boolean;
  dueToday: boolean;
  simulated: readonly TimeSpan[];
  colors: ChartColors;
}

export class OverlayPrimitive implements ISeriesPrimitive {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Area' | 'Line' | 'Candlestick'> | null = null;
  private requestUpdate: () => void = () => undefined;
  private readonly paneView: IPrimitivePaneView;
  private readonly renderer: OverlayRenderer;

  constructor(public model: OverlayModel) {
    this.renderer = new OverlayRenderer(this);
    this.paneView = {
      zOrder: () => 'bottom',
      renderer: () => this.renderer,
    };
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Area' | 'Line' | 'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  apply(model: OverlayModel): void {
    this.model = model;
    this.requestUpdate();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  autoscaleInfo(): AutoscaleInfo | null {
    const prices = [this.model.target, this.model.entry].filter(
      (price): price is number => price !== undefined,
    );
    if (prices.length === 0) return null;
    return {
      priceRange: {
        minValue: Math.min(...prices),
        maxValue: Math.max(...prices),
      },
    };
  }

  x(time: number): number | null {
    const coordinate = this.chart?.timeScale().timeToCoordinate(time as UTCTimestamp);
    return coordinate === null || coordinate === undefined ? null : coordinate;
  }

  y(price: number): number | null {
    const coordinate = this.series?.priceToCoordinate(price);
    return coordinate === null || coordinate === undefined ? null : coordinate;
  }
}

class OverlayRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly primitive: OverlayPrimitive) {}

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { width, height } = scope.mediaSize;
      const model = this.primitive.model;
      this.zone(ctx, model, width, height);
      this.hatchSpans(ctx, model, height);
      this.deadlineHatch(ctx, model, width, height);
      this.dueShade(ctx, model, width, height);
      this.verticals(ctx, model, height);
      this.targetGlow(ctx, model, width);
    });
  }

  private zone(
    ctx: CanvasRenderingContext2D,
    model: OverlayModel,
    width: number,
    height: number,
  ): void {
    if (!model.zone || model.target === undefined) return;
    const y = this.primitive.y(model.target);
    if (y === null) return;
    ctx.fillStyle = model.colors.orangeWash;
    if (model.inverted) ctx.fillRect(0, 0, width, y);
    else ctx.fillRect(0, y, width, Math.max(0, height - y));
  }

  private hatchSpans(
    ctx: CanvasRenderingContext2D,
    model: OverlayModel,
    height: number,
  ): void {
    for (const span of model.simulated) {
      const from = this.primitive.x(span.from);
      const to = this.primitive.x(span.to);
      if (from === null || to === null) continue;
      hatch(
        ctx,
        Math.min(from, to),
        0,
        Math.abs(to - from),
        height,
        withAlpha(model.colors.orange300, 0.35),
        8,
      );
    }
  }

  private deadlineHatch(
    ctx: CanvasRenderingContext2D,
    model: OverlayModel,
    width: number,
    height: number,
  ): void {
    const x = this.primitive.x(model.deadline);
    if (x === null) return;
    hatch(ctx, x, 0, Math.max(0, width - x), height, withAlpha(model.colors.fg1, 0.04), 8);
  }

  /** Past the due date. Same weight as the orange wash under the target. */
  private dueShade(
    ctx: CanvasRenderingContext2D,
    model: OverlayModel,
    width: number,
    height: number,
  ): void {
    const x = this.primitive.x(model.due);
    if (x === null) return;
    ctx.fillStyle = withAlpha(model.colors.down, 0.08);
    ctx.fillRect(x, 0, Math.max(0, width - x), height);
  }

  private verticals(
    ctx: CanvasRenderingContext2D,
    model: OverlayModel,
    height: number,
  ): void {
    const deadline = this.primitive.x(model.deadline);
    if (deadline !== null) {
      if (model.deadlineToday) {
        ctx.save();
        ctx.shadowColor = model.colors.warn;
        ctx.shadowBlur = 12;
        strokeVertical(ctx, deadline, height, model.colors.warn, false, 2);
        ctx.restore();
      } else {
        strokeVertical(
          ctx,
          deadline,
          height,
          model.deadlinePassed ? withAlpha(model.colors.warn, 0.45) : model.colors.warn,
          false,
          1,
        );
      }
      label(ctx, model.deadlineLabel, deadline, model.colors.warn);
    }
    const due = this.primitive.x(model.due);
    if (due !== null) {
      ctx.save();
      ctx.shadowColor = withAlpha(model.colors.down, 0.3);
      ctx.shadowBlur = 6;
      ctx.strokeStyle = withAlpha(model.colors.down, 0.3);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(due, 0);
      ctx.lineTo(due, height);
      ctx.stroke();
      ctx.restore();
      strokeVertical(ctx, due, height, withAlpha(model.colors.down, 0.7), true, model.dueToday ? 2 : 1);
      label(ctx, model.dueLabel, due, model.colors.down);
    }
    const now = this.primitive.x(model.now);
    if (now !== null) {
      strokeVertical(ctx, now, height, model.colors.fg3, 'dotted', 1);
    }
  }

  private targetGlow(
    ctx: CanvasRenderingContext2D,
    model: OverlayModel,
    width: number,
  ): void {
    if (model.target === undefined) return;
    const y = this.primitive.y(model.target);
    if (y === null) return;
    ctx.save();
    ctx.shadowColor = withAlpha(model.colors.orange, 0.3);
    ctx.shadowBlur = 6;
    ctx.strokeStyle = withAlpha(model.colors.orange, 0.3);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.restore();
  }
}

function strokeVertical(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  color: string,
  dash: boolean | 'dotted',
  width: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash === 'dotted' ? [1, 3] : dash ? [4, 4] : []);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '11px sans-serif';
  ctx.fillText(text, x + 6, 14);
  ctx.restore();
}

function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  step: number,
): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let offset = -height; offset < width + height; offset += step) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + height, y + height);
    ctx.stroke();
  }
  ctx.restore();
}
