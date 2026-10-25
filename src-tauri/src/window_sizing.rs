use tauri::{LogicalPosition, LogicalSize, PhysicalSize, WebviewWindow};

const TARGET_WIDTH: f64 = 1250.0;
const TARGET_HEIGHT: f64 = 700.0;
const MIN_WIDTH: f64 = 1000.0;
const MIN_HEIGHT: f64 = 600.0;
const MAX_WORK_AREA_RATIO: f64 = 0.9;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InitialWindowSize {
    pub width: f64,
    pub height: f64,
}

pub fn initial_window_size(work_area: PhysicalSize<u32>, scale_factor: f64) -> InitialWindowSize {
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let max_width = ((work_area.width as f64 / scale) * MAX_WORK_AREA_RATIO).floor();
    let max_height = ((work_area.height as f64 / scale) * MAX_WORK_AREA_RATIO).floor();
    InitialWindowSize {
        width: TARGET_WIDTH.min(max_width).max(MIN_WIDTH.min(max_width)),
        height: TARGET_HEIGHT
            .min(max_height)
            .max(MIN_HEIGHT.min(max_height)),
    }
}

pub fn fit_main_window(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let work_area = monitor.work_area();
    let scale = monitor.scale_factor();
    let size = initial_window_size(work_area.size, scale);
    window
        .set_min_size(Some(LogicalSize::new(
            MIN_WIDTH.min(size.width),
            MIN_HEIGHT.min(size.height),
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_size(LogicalSize::new(size.width, size.height))
        .map_err(|error| error.to_string())?;
    let origin_x = work_area.position.x as f64 / scale;
    let origin_y = work_area.position.y as f64 / scale;
    let available_width = work_area.size.width as f64 / scale;
    let available_height = work_area.size.height as f64 / scale;
    window
        .set_position(LogicalPosition::new(
            origin_x + (available_width - size.width) / 2.0,
            origin_y + (available_height - size.height) / 2.0,
        ))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::initial_window_size;
    use tauri::PhysicalSize;

    #[test]
    fn initial_size_uses_target_at_100_and_125_percent_when_work_area_allows() {
        let work_area = PhysicalSize::new(1920, 1040);
        for scale in [1.0, 1.25] {
            assert_eq!(
                initial_window_size(work_area, scale),
                super::InitialWindowSize {
                    width: 1250.0,
                    height: 700.0
                }
            );
        }
    }

    #[test]
    fn initial_size_is_limited_to_ninety_percent_of_scaled_work_area() {
        assert_eq!(
            initial_window_size(PhysicalSize::new(1920, 1040), 1.5),
            super::InitialWindowSize {
                width: 1152.0,
                height: 624.0
            }
        );
    }

    #[test]
    fn small_work_area_takes_priority_over_configured_minimum() {
        let size = initial_window_size(PhysicalSize::new(1200, 700), 1.5);
        assert_eq!(size.width, 720.0);
        assert_eq!(size.height, 420.0);
    }
}
