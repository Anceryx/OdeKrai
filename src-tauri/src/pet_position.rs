use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub(crate) struct MonitorId {
    pub(crate) name: Option<String>,
    pub(crate) left: i32,
    pub(crate) top: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) scale_factor: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub(crate) struct RelativePosition {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub(crate) struct MonitorPosition {
    pub(crate) monitor: MonitorId,
    pub(crate) relative: RelativePosition,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub(crate) struct PersistedPetPosition {
    pub(crate) active_monitor: MonitorId,
    pub(crate) monitors: Vec<MonitorPosition>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct WorkArea {
    pub(crate) left: f64,
    pub(crate) top: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct WindowSize {
    pub(crate) width: f64,
    pub(crate) height: f64,
}

pub(crate) fn fit_size(size: WindowSize, work_area: WorkArea) -> WindowSize {
    WindowSize {
        width: size.width.clamp(1.0, work_area.width.max(1.0)),
        height: size.height.clamp(1.0, work_area.height.max(1.0)),
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct WindowPosition {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

pub(crate) fn clamp_position(
    position: WindowPosition,
    work_area: WorkArea,
    window_size: WindowSize,
) -> WindowPosition {
    WindowPosition {
        x: position.x.clamp(
            work_area.left,
            (work_area.left + work_area.width - window_size.width).max(work_area.left),
        ),
        y: position.y.clamp(
            work_area.top,
            (work_area.top + work_area.height - window_size.height).max(work_area.top),
        ),
    }
}

pub(crate) fn relative_position(
    position: WindowPosition,
    work_area: WorkArea,
    window_size: WindowSize,
) -> RelativePosition {
    let position = clamp_position(position, work_area, window_size);
    let max_x = (work_area.left + work_area.width - window_size.width).max(work_area.left);
    let max_y = (work_area.top + work_area.height - window_size.height).max(work_area.top);
    RelativePosition {
        x: fraction(position.x, work_area.left, max_x),
        y: fraction(position.y, work_area.top, max_y),
    }
}

pub(crate) fn position_from_relative(
    relative: RelativePosition,
    work_area: WorkArea,
    window_size: WindowSize,
) -> WindowPosition {
    let max_x = (work_area.left + work_area.width - window_size.width).max(work_area.left);
    let max_y = (work_area.top + work_area.height - window_size.height).max(work_area.top);
    clamp_position(
        WindowPosition {
            x: work_area.left + relative.x.clamp(0.0, 1.0) * (max_x - work_area.left),
            y: work_area.top + relative.y.clamp(0.0, 1.0) * (max_y - work_area.top),
        },
        work_area,
        window_size,
    )
}

fn fraction(value: f64, min: f64, max: f64) -> f64 {
    if max <= min {
        0.0
    } else {
        ((value - min) / (max - min)).clamp(0.0, 1.0)
    }
}

pub(crate) fn monitor_matches(saved: &MonitorId, current: &MonitorId) -> bool {
    match (&saved.name, &current.name) {
        (Some(saved_name), Some(current_name)) => {
            saved_name == current_name && saved.left == current.left && saved.top == current.top
        }
        _ => saved.left == current.left && saved.top == current.top,
    }
}

pub(crate) fn matching_monitor_index(saved: &MonitorId, available: &[MonitorId]) -> Option<usize> {
    available
        .iter()
        .position(|current| saved == current)
        .or_else(|| {
            available
                .iter()
                .position(|current| monitor_matches(saved, current))
        })
}

pub(crate) fn selected_monitor_index(
    saved: &PersistedPetPosition,
    available: &[MonitorId],
    primary_index: Option<usize>,
) -> Option<usize> {
    matching_monitor_index(&saved.active_monitor, available)
        .or_else(|| primary_index.filter(|index| *index < available.len()))
}

pub(crate) fn saved_for_monitor<'a>(
    saved: &'a PersistedPetPosition,
    monitor: &MonitorId,
) -> Option<&'a MonitorPosition> {
    saved
        .monitors
        .iter()
        .find(|entry| monitor_matches(&entry.monitor, monitor))
}

#[cfg(test)]
mod tests {
    use super::{
        clamp_position, fit_size, matching_monitor_index, monitor_matches, position_from_relative,
        relative_position, saved_for_monitor, selected_monitor_index, MonitorId, MonitorPosition,
        PersistedPetPosition, RelativePosition, WindowPosition, WindowSize, WorkArea,
    };

    fn monitor(name: &str, left: i32, width: u32, scale_factor: f64) -> MonitorId {
        MonitorId {
            name: Some(name.into()),
            left,
            top: 0,
            width,
            height: 1080,
            scale_factor,
        }
    }

    #[test]
    fn removed_monitor_falls_back_to_primary_and_retained_monitor_position() {
        let removed = monitor("Display B", -1920, 1920, 1.0);
        let primary = monitor("Display A", 0, 1920, 1.0);
        let saved = PersistedPetPosition {
            active_monitor: removed,
            monitors: vec![MonitorPosition {
                monitor: primary.clone(),
                relative: RelativePosition { x: 0.3, y: 0.7 },
            }],
        };

        assert_eq!(
            selected_monitor_index(&saved, std::slice::from_ref(&primary), Some(0)),
            Some(0)
        );
        assert_eq!(saved_for_monitor(&saved, &primary).unwrap().relative.x, 0.3);
    }

    #[test]
    fn scale_change_still_matches_named_monitor_and_updates_identity() {
        let before = monitor("Display A", 0, 1920, 1.0);
        let after = monitor("Display A", 0, 2560, 1.5);

        assert!(monitor_matches(&before, &after));
        assert_eq!(matching_monitor_index(&before, &[after]), Some(0));
    }

    #[test]
    fn relative_position_restores_on_monitor_with_negative_origin() {
        let area = WorkArea {
            left: -1920.0,
            top: 0.0,
            width: 1920.0,
            height: 1040.0,
        };
        let size = WindowSize {
            width: 300.0,
            height: 180.0,
        };
        let original = WindowPosition {
            x: -420.0,
            y: 640.0,
        };
        let relative = relative_position(original, area, size);

        assert_eq!(position_from_relative(relative, area, size), original);
    }

    #[test]
    fn reduced_resolution_keeps_position_fraction_and_clamps_inside_work_area() {
        let relative = RelativePosition { x: 0.95, y: 0.95 };
        let position = position_from_relative(
            relative,
            WorkArea {
                left: 0.0,
                top: 40.0,
                width: 1280.0,
                height: 680.0,
            },
            WindowSize {
                width: 500.0,
                height: 300.0,
            },
        );

        assert_eq!(position, WindowPosition { x: 741.0, y: 401.0 });
        assert_eq!(
            clamp_position(
                WindowPosition {
                    x: 5000.0,
                    y: -400.0
                },
                WorkArea {
                    left: -1920.0,
                    top: 40.0,
                    width: 1920.0,
                    height: 1040.0,
                },
                WindowSize {
                    width: 300.0,
                    height: 180.0,
                },
            ),
            WindowPosition { x: -300.0, y: 40.0 }
        );
    }

    #[test]
    fn expanded_pet_fits_small_work_area_before_position_is_clamped() {
        let work = WorkArea {
            left: 0.0,
            top: 0.0,
            width: 320.0,
            height: 180.0,
        };
        let size = fit_size(
            WindowSize {
                width: 420.0,
                height: 220.0,
            },
            work,
        );
        assert_eq!(
            size,
            WindowSize {
                width: 320.0,
                height: 180.0
            }
        );
        assert_eq!(
            clamp_position(WindowPosition { x: 5.0, y: 7.0 }, work, size),
            WindowPosition { x: 0.0, y: 0.0 }
        );
    }
}
