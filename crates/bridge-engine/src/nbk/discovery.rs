//! Discovery Protocol: Show new 4+ card suits (forcing)

use crate::nbk::{AuctionModel, CallPurpose, CallSemantics, HandConstraint};
use bridge_core::Call;

/// Discovery Protocol implementation
pub struct DiscoveryProtocol;

impl DiscoveryProtocol {
    /// Get the hand constraints required for a call to be a valid discovery bid
    ///
    /// Discovery bids show a new 4+ card suit that partner hasn't shown.
    /// Returns the constraints expressed by the bid if it's a valid discovery candidate.
    pub fn get_semantics(auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        let (level, strain) = match call {
            Call::Bid { level, strain } => (*level, *strain),
            _ => return None,
        };

        let suit = strain.to_suit()?;

        // Must not be partner's suit or our own suit
        if auction_model.partner_model.has_shown_suit(suit)
            || auction_model.bidder_model.has_shown_suit(suit)
        {
            return None;
        }

        // Calculate HCP requirement
        let min_combined_points = crate::nbk::PointRanges::min_points_for_suited_bid(level);
        let needed_hcp =
            min_combined_points.saturating_sub(auction_model.partner_model.min_hcp.unwrap_or(0));

        // It's a match! Returns the constraints required for this discovery bid.
        Some(CallSemantics {
            purpose: CallPurpose::Discovery,
            shows: vec![
                HandConstraint::MinLength(suit, 4),
                HandConstraint::MinHcp(needed_hcp),
            ],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::{HandModel, PartnerModel};
    use bridge_core::{Distribution, Shape, Strain, Suit};

    #[test]
    fn test_no_discovery_without_4_cards() {
        // Hand has 3-3-3-4 distribution
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 4,
                diamonds: 3,
                hearts: 3,
                spades: 3,
            }, // 4 clubs, 3 others
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_hcp: Some(13),
            ..Default::default()
        };

        // Try some bids
        let diamonds = Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        };
        let clubs = Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        };

        let auction_model = AuctionModel {
            partner_model,
            bidder_model: PartnerModel::default(),
        };

        let diamond_constraints = DiscoveryProtocol::get_semantics(&auction_model, &diamonds);
        assert!(!diamond_constraints
            .map(|s| hand_model.satisfies_all(s.shows))
            .unwrap_or(false));

        let club_constraints = DiscoveryProtocol::get_semantics(&auction_model, &clubs);
        assert!(club_constraints
            .map(|s| hand_model.satisfies_all(s.shows))
            .unwrap_or(false));
    }

    #[test]
    fn test_discovery_finds_4_card_suits() {
        // Hand has 4-4-3-2 distribution
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_hcp: Some(13),
            ..Default::default()
        };

        let h_bid = Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        };
        let s_bid = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };

        let auction_model = AuctionModel {
            partner_model,
            bidder_model: PartnerModel::default(),
        };

        // Should match both 1H and 1S (23 combined HCP > 16)
        let h_semantics = DiscoveryProtocol::get_semantics(&auction_model, &h_bid).unwrap();
        assert!(hand_model.satisfies_all(h_semantics.shows.clone()));
        assert!(h_semantics
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 4)));

        let s_semantics = DiscoveryProtocol::get_semantics(&auction_model, &s_bid).unwrap();
        assert!(hand_model.satisfies_all(s_semantics.shows.clone()));
        assert!(s_semantics
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 4)));
    }

    #[test]
    fn test_discovery_excludes_partner_suits() {
        // Hand has 4 spades
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        // Partner opened 1H
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            }, // Partner has 4+ hearts
            min_hcp: Some(13),
            ..Default::default()
        };

        let h_bid = Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        };
        let s_bid = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };

        let auction_model = AuctionModel {
            partner_model,
            bidder_model: PartnerModel::default(),
        };

        assert!(DiscoveryProtocol::get_semantics(&auction_model, &h_bid).is_none());
        let s_semantics = DiscoveryProtocol::get_semantics(&auction_model, &s_bid).unwrap();
        assert!(hand_model.satisfies_all(s_semantics.shows));
    }

    #[test]
    fn test_discovery_checks_point_requirements() {
        // Hand has 4 spades but only 5 HCP
        let hand_model = HandModel {
            hcp: 5,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        // Partner has 10 HCP (total 15, need 16 for 1-level)
        let partner_model = PartnerModel {
            min_hcp: Some(10),
            ..Default::default()
        };

        let s_bid = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };

        let auction_model = AuctionModel {
            partner_model,
            bidder_model: PartnerModel::default(),
        };

        // Should return constraints, but hand should not satisfy them
        let s_semantics = DiscoveryProtocol::get_semantics(&auction_model, &s_bid).unwrap();
        assert!(!hand_model.satisfies_all(s_semantics.shows));
    }
}
