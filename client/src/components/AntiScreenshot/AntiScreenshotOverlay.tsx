import './AntiScreenshotOverlay.css';

export function AntiScreenshotOverlay() {

  return (
    <div className="anti-screenshot-overlay" aria-hidden="true">
      {/* Tiled diagonal watermarks */}
      <div className="anti-screenshot-tiles">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="anti-screenshot-tile">
            <img src="/logo.png" alt="" className="anti-screenshot-tile-logo" />
          </div>
        ))}
      </div>

      {/* Large center watermark */}
      <div className="anti-screenshot-center">
        <img src="/logo.png" alt="" className="anti-screenshot-center-logo" />
      </div>
    </div>
  );
}
