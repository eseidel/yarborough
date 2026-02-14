//! Point requirement tables for NBK bidding

use crate::nbk::{HandConstraint, PartnerModel};

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

    pub fn for_suited_bid(level: u8, partner_model: &PartnerModel) -> Vec<HandConstraint> {
        let partner_min_hcp = partner_model.min_hcp.unwrap_or(0);
        let min_points = Self::min_points_for_suited_bid(level);
        let mut constraints = vec![HandConstraint::MinHcp(
            min_points.saturating_sub(partner_min_hcp),
        )];

        let next_min_points = Self::min_points_for_suited_bid(level + 1);
        if next_min_points < 40 {
            constraints.push(HandConstraint::MaxHcp(
                (next_min_points - 1).saturating_sub(partner_min_hcp),
            ));
        }

        constraints
    }

    pub fn for_nt_bid(level: u8, partner_model: &PartnerModel) -> Vec<HandConstraint> {
        let partner_min_hcp = partner_model.min_hcp.unwrap_or(0);
        let min_points = Self::min_points_for_nt_bid(level);
        let mut constraints = vec![HandConstraint::MinHcp(
            min_points.saturating_sub(partner_min_hcp),
        )];

        let next_min_points = Self::min_points_for_nt_bid(level + 1);
        if next_min_points < 40 {
            constraints.push(HandConstraint::MaxHcp(
                (next_min_points - 1).saturating_sub(partner_min_hcp),
            ));
        }

        constraints
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
}
