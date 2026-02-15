//! Discovery Rules for the NBK DSL

use crate::nbk::{AuctionModel, CallPurpose, CallSemantics, HandConstraint, PointRanges};
use crate::rules::BiddingRule;
use bridge_core::Call;

pub struct NewSuitDiscovery;
impl BiddingRule for NewSuitDiscovery {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("{:?} Discovery", strain),
            _ => "New Suit Discovery".to_string(),
        }
    }

    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
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
        let min_combined_points = PointRanges::min_points_for_suited_bid(level);
        let needed_hcp =
            min_combined_points.saturating_sub(auction_model.partner_model.min_hcp.unwrap_or(0));

        Some(CallSemantics {
            purpose: CallPurpose::Discovery,
            shows: vec![
                HandConstraint::MinLength(suit, 4),
                HandConstraint::MinHcp(needed_hcp),
            ],
            rule_name: self.name(call),
            description: format!("Discovery bid showing 4+ cards in {:?}", suit),
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
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 4,
                diamonds: 3,
                hearts: 3,
                spades: 3,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_hcp: Some(13),
            ..Default::default()
        };
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
            auction: {
                let mut a = bridge_core::Auction::new(bridge_core::Position::North);
                a.add_call(Call::Bid {
                    level: 1,
                    strain: Strain::Clubs,
                });
                a
            },
            ..AuctionModel::default()
        };
        let diamond_constraints = NewSuitDiscovery.get_semantics(&auction_model, &diamonds);
        assert!(!diamond_constraints
            .map(|s| hand_model.satisfies_all(s.shows))
            .unwrap_or(false));
        let club_constraints = NewSuitDiscovery.get_semantics(&auction_model, &clubs);
        assert!(club_constraints
            .map(|s| hand_model.satisfies_all(s.shows))
            .unwrap_or(false));
    }

    #[test]
    fn test_discovery_excludes_partner_suits() {
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            },
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
            auction: {
                let mut a = bridge_core::Auction::new(bridge_core::Position::North);
                a.add_call(Call::Bid {
                    level: 1,
                    strain: Strain::Hearts,
                });
                a
            },
            ..AuctionModel::default()
        };
        assert!(NewSuitDiscovery
            .get_semantics(&auction_model, &h_bid)
            .is_none());
        let s_semantics = NewSuitDiscovery
            .get_semantics(&auction_model, &s_bid)
            .unwrap();
        assert!(hand_model.satisfies_all(s_semantics.shows));
    }
}
