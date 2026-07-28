import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type IPriceLine,
} from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';
import { useIndicatorStore } from '../../store/indicatorStore';
import { useSettingsStore } from '../../store/settingsStore';
import { BoxOverlayPrimitive, type ChartBoxData } from './boxPrimitive';

interface Props {
  onCrosshair?: (price: number | null) => void;
}

export default function ChartWidget({ onCrosshair }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema20Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref  = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpRef    = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMidRef   = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowRef   = useRef<ISeriesApi<'Line'> | null>(null);
  const macdRef    = useRef<ISeriesApi<'Histogram'> | null>(null);
  const srPriceLinesRef  = useRef<IPriceLine[]>([]);
  const bosPriceLinesRef = useRef<IPriceLine[]>([]);
  const boxPrimitiveRef  = useRef<BoxOverlayPrimitive | null>(null);

  const lastFullLengthRef = useRef(0);
  const lastCandleTimeRef = useRef(0);

  const onCrosshairRef = useRef(onCrosshair);
  onCrosshairRef.current = onCrosshair;

  const candles    = useChartStore(s => s.candles);
  const interval   = useChartStore(s => s.interval);
  const indicators = useIndicatorStore(s => s.values);
  const settings   = useSettingsStore(s => s.indicators);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0f172a' },
        textColor:  '#94a3b8',
        fontSize:   11,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode:      CrosshairMode.Normal,
        vertLine:  { color: '#475569', style: LineStyle.Dashed },
        horzLine:  { color: '#475569', style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: {
        borderColor:    '#334155',
        timeVisible:    true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale:  true,
    });

    chartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor:         '#22c55e',
      downColor:       '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:     '#22c55e',
      wickDownColor:   '#ef4444',
    });

    // Attach box primitive for OB/FVG/RJB rendering
    boxPrimitiveRef.current = new BoxOverlayPrimitive();
    candleSeriesRef.current.attachPrimitive(boxPrimitiveRef.current);

    ema20Ref.current  = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false });
    ema50Ref.current  = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false });
    ema200Ref.current = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, priceLineVisible: false });
    bbUpRef.current   = chart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false });
    bbMidRef.current  = chart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false });
    bbLowRef.current  = chart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false });
    macdRef.current   = chart.addSeries(HistogramSeries, { color: '#22c55e', priceScaleId: 'macd', priceLineVisible: false });
    chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    if (onCrosshairRef.current) {
      chart.subscribeCrosshairMove((param) => {
        if (!candleSeriesRef.current || !param.seriesData) {
          onCrosshairRef.current?.(null);
          return;
        }
        const entry = param.seriesData.get(candleSeriesRef.current);
        onCrosshairRef.current?.(entry && 'close' in entry ? (entry as { close: number }).close : null);
      });
    }

    const resizeObs = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        boxPrimitiveRef.current?.updateAllViews();
      }
    });
    resizeObs.observe(containerRef.current);

    return () => {
      resizeObs.disconnect();
      chart.remove();
      chartRef.current         = null;
      boxPrimitiveRef.current  = null;
      lastFullLengthRef.current = 0;
      lastCandleTimeRef.current = 0;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { secondsVisible: interval === '1min' },
    });
  }, [interval]);

  // Update candles
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (candles.length === 0) {
      try { series.setData([]); } catch { /* ignore */ }
      lastFullLengthRef.current = 0;
      lastCandleTimeRef.current = 0;
      return;
    }

    const last  = candles[candles.length - 1];
    const delta = candles.length - lastFullLengthRef.current;
    const isFullLoad = lastFullLengthRef.current === 0 || delta > 1 || delta < 0;

    if (isFullLoad) {
      try {
        series.setData(
          candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        chartRef.current?.timeScale().fitContent();
        lastFullLengthRef.current = candles.length;
        lastCandleTimeRef.current = last.time;
      } catch (e) {
        console.warn('ChartWidget setData error:', e);
      }
      return;
    }

    try {
      series.update({ time: last.time as Time, open: last.open, high: last.high, low: last.low, close: last.close });
      lastFullLengthRef.current = candles.length;
      lastCandleTimeRef.current = last.time;
    } catch {
      try {
        series.setData(
          candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        chartRef.current?.timeScale().fitContent();
        lastFullLengthRef.current = candles.length;
        lastCandleTimeRef.current = last.time;
      } catch { /* ignore */ }
    }
  }, [candles]);

  // S/R price lines
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    srPriceLinesRef.current.forEach(pl => { try { series.removePriceLine(pl); } catch { /* ignore */ } });
    srPriceLinesRef.current = [];

    if (!settings.supportResistance) return;
    indicators.srLevels.slice(-8).forEach(lvl => {
      try {
        const pl = series.createPriceLine({
          price:            lvl.price,
          color:            lvl.type === 'support' ? '#22c55e99' : '#ef444499',
          lineWidth:        1,
          lineStyle:        LineStyle.Dashed,
          axisLabelVisible: true,
          title:            lvl.type === 'support' ? 'S' : 'R',
        });
        srPriceLinesRef.current.push(pl);
      } catch { /* ignore */ }
    });
  }, [indicators.srLevels, settings.supportResistance]);

  // BOS price lines
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    bosPriceLinesRef.current.forEach(pl => { try { series.removePriceLine(pl); } catch { /* ignore */ } });
    bosPriceLinesRef.current = [];

    if (!settings.bos) return;
    indicators.bosEvents.slice(-5).forEach(bos => {
      try {
        const pl = series.createPriceLine({
          price:            bos.price,
          color:            bos.type === 'bullish' ? '#22c55e88' : '#ef444488',
          lineWidth:        1,
          lineStyle:        LineStyle.Solid,
          axisLabelVisible: true,
          title:            'BoS',
        });
        bosPriceLinesRef.current.push(pl);
      } catch { /* ignore */ }
    });
  }, [indicators.bosEvents, settings.bos]);

  // Box primitive: OB / FVG / RJB
  useEffect(() => {
    if (!boxPrimitiveRef.current || candles.length === 0) return;
    const boxes: ChartBoxData[] = [];

    if (settings.orderBlocks) {
      for (const ob of indicators.orderBlocks) {
        boxes.push({
          id:          `ob_${ob.time}_${ob.type}`,
          fromTime:    ob.time,
          toTime:      ob.mitigated ? ob.endTime : null,
          topPrice:    ob.top,
          bottomPrice: ob.bottom,
          fillColor:   ob.type === 'bullish'
            ? (ob.mitigated ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.18)')
            : (ob.mitigated ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.18)'),
          borderColor: ob.type === 'bullish' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
          label: 'OB',
        });
      }
    }

    if (settings.fvg) {
      for (const fvg of indicators.fvgs) {
        boxes.push({
          id:          `fvg_${fvg.time}_${fvg.type}`,
          fromTime:    fvg.time,
          toTime:      fvg.broken ? fvg.endTime : null,
          topPrice:    fvg.top,
          bottomPrice: fvg.bottom,
          fillColor:   fvg.type === 'bullish' ? 'rgba(6,182,212,0.12)' : 'rgba(249,115,22,0.12)',
          borderColor: fvg.type === 'bullish' ? 'rgba(6,182,212,0.5)'  : 'rgba(249,115,22,0.5)',
          label: 'FVG',
        });
      }
    }

    if (settings.rejectionBlocks) {
      for (const rb of indicators.rejectionBlocks) {
        boxes.push({
          id:          `rjb_${rb.time}_${rb.type}`,
          fromTime:    rb.time,
          toTime:      null,
          topPrice:    rb.top,
          bottomPrice: rb.bottom,
          fillColor:   rb.type === 'bullish' ? 'rgba(45,212,191,0.15)' : 'rgba(244,114,182,0.15)',
          borderColor: rb.type === 'bullish' ? 'rgba(45,212,191,0.55)' : 'rgba(244,114,182,0.55)',
          label: 'RJB',
        });
      }
    }

    boxPrimitiveRef.current.setBoxes(boxes);
  }, [
    indicators.orderBlocks, indicators.fvgs, indicators.rejectionBlocks,
    settings.orderBlocks, settings.fvg, settings.rejectionBlocks,
    candles,
  ]);

  // Indicator series
  useEffect(() => {
    if (candles.length === 0) return;
    const { ema20, ema50, ema200, bb } = indicators;
    const times = candles.map(c => c.time as Time);

    type LP = { time: Time; value: number };
    function toPoints(values: number[]): LP[] {
      return values
        .map((v, i) => ({ time: times[i], value: v }))
        .filter(p => !isNaN(p.value) && isFinite(p.value));
    }
    function setLine(
      ref: React.RefObject<ISeriesApi<'Line'> | null>,
      visible: boolean,
      data?: LP[],
    ) {
      if (!ref.current) return;
      try {
        ref.current.applyOptions({ visible });
        if (visible && data) ref.current.setData(data);
      } catch { /* ignore */ }
    }

    setLine(ema20Ref,  settings.ema20,  toPoints(ema20));
    setLine(ema50Ref,  settings.ema50,  toPoints(ema50));
    setLine(ema200Ref, settings.ema200, toPoints(ema200));
    setLine(bbUpRef,   settings.bb,     toPoints(bb.upper));
    setLine(bbMidRef,  settings.bb,     toPoints(bb.middle));
    setLine(bbLowRef,  settings.bb,     toPoints(bb.lower));

    if (macdRef.current) {
      try {
        const hist = indicators.macd.hist;
        macdRef.current.applyOptions({ visible: settings.macd });
        if (settings.macd) {
          macdRef.current.setData(
            hist
              .map((v, i) => ({ time: times[i], value: v, color: v >= 0 ? '#22c55e' : '#ef4444' }))
              .filter(p => !isNaN(p.value) && isFinite(p.value))
          );
        }
      } catch { /* ignore */ }
    }
  }, [indicators, settings, candles]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 'clamp(220px, 40vh, 480px)' }}
    />
  );
}
