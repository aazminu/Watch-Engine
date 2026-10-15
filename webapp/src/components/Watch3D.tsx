import styled from 'styled-components';

// Sketchfab embed of a realistic luxury watch model (CC Attribution license)
// Model: "Luxury Watch" by Pieter Ferreira — https://sketchfab.com/3d-models/luxury-watch-98acd80e57204118ba67acf93b3ad735

export default function Watch3D() {
  return (
    <Container>
      <iframe
        title="3D Watch"
        src="https://sketchfab.com/models/98acd80e57204118ba67acf93b3ad735/embed?autostart=1&transparent=1&ui_theme=dark&ui_controls=0&ui_infos=0&ui_stop=0&ui_inspector=0&ui_watermark_link=0&ui_watermark=0&ui_ar=0&ui_help=0&ui_settings=0&ui_vr=0&ui_fullscreen=0&ui_annotations=0&camera=0&preload=1&orbit_constraint_zoom_in=50&orbit_constraint_zoom_out=200"
        allow="autoplay; fullscreen; xr-spatial-tracking"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '16px',
        }}
      />
    </Container>
  );
}

const Container = styled.div`
  width: 100%;
  height: 100%;
  min-height: 420px;
  position: relative;
  border-radius: 16px;
  overflow: hidden;
`;
