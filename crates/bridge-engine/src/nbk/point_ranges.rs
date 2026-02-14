//! Point requirement tables for NBK bidding

/// Point zones for determining bid level
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    /// Less than 25 combined points
    Partscore,
    /// 25-29 combined points
    Game,
    /// 30+ combined points
    Slam,
}

/// Point range requirements for bidding
pub struct PointRanges;

impl PointRanges {
    /// Minimum combined points required for a suited bid at the given level
    ///
    /// Based on NBK spec Section 3.1:
    /// - Level 1: 16 points
    /// - Level 2: 19 points
    /// - Level 3: 22 points
    /// - Level 4: 25 points
    /// - Level 5: 28 points
    /// - Level 6: 33 points
    /// - Level 7: 37 points
    pub fn min_points_for_suited_bid(level: u8) -> u8 {
        match level {
            1 => 16,
            2 => 19,
            3 => 22,
            4 => 25,
            5 => 28,
            6 => 33,
            7 => 37,
            _ => 40, // Safety fallback for invalid levels
        }
    }

    /// Minimum combined points required for a notrump bid at the given level
    ///
    /// Based on NBK spec Section 3.2:
    /// - Level 1: 19 points
    /// - Level 2: 22 points
    /// - Level 3: 25 points
    /// - Level 4: 28 points
    /// - Level 5: 30 points
    /// - Level 6: 33 points
    /// - Level 7: 37 points
    pub fn min_points_for_nt_bid(level: u8) -> u8 {
        match level {
            1 => 19,
            2 => 22,
            3 => 25,
            4 => 28,
            5 => 30,
            6 => 33,
            7 => 37,
            _ => 40, // Safety fallback for invalid levels
        }
    }

    /// Determine the target zone based on combined points
    pub fn target_zone(combined_points: u8) -> Zone {
        if combined_points < 25 {
            Zone::Partscore
        } else if combined_points < 30 {
            Zone::Game
        } else {
            Zone::Slam
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_suited_bid_points() {
        assert_eq!(PointRanges::min_points_for_suited_bid(1), 16);
        assert_eq!(PointRanges::min_points_for_suited_bid(2), 19);
        assert_eq!(PointRanges::min_points_for_suited_bid(4), 25);
        assert_eq!(PointRanges::min_points_for_suited_bid(7), 37);
    }

    #[test]
    fn test_nt_bid_points() {
        assert_eq!(PointRanges::min_points_for_nt_bid(1), 19);
        assert_eq!(PointRanges::min_points_for_nt_bid(3), 25);
        assert_eq!(PointRanges::min_points_for_nt_bid(5), 30);
    }

    #[test]
    fn test_zones() {
        assert_eq!(PointRanges::target_zone(20), Zone::Partscore);
        assert_eq!(PointRanges::target_zone(25), Zone::Game);
        assert_eq!(PointRanges::target_zone(29), Zone::Game);
        assert_eq!(PointRanges::target_zone(30), Zone::Slam);
        assert_eq!(PointRanges::target_zone(35), Zone::Slam);
    }
}
