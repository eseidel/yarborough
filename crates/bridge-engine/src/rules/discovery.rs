//! Discovery Rules for the NBK DSL

use crate::rules::auction_predicates::AuctionPredicate;
use crate::rules::auction_predicates::IsOpen;
use crate::rules::bidding_rule::BiddingRule;
use crate::rules::call_predicates::CallPredicate;
use crate::rules::call_predicates::IsUnbidSuit;
use crate::rules::shows::ShowSuitLength;
use crate::rules::shows::Shows;
use crate::rules::shows::SufficientValues;
use bridge_core::Call;

pub struct NewSuitDiscovery;
impl BiddingRule for NewSuitDiscovery {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("{:?} Discovery", strain),
            _ => "New Suit Discovery".to_string(),
        }
    }

    fn description(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("Discovery bid showing 4+ cards in {:?}", strain),
            _ => "Discovery bid showing 4+ cards in new suit".to_string(),
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsUnbidSuit)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowSuitLength(4)), Box::new(SufficientValues)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::{AuctionModel, HandModel, PartnerModel};
    use bridge_core::{Call, Distribution, Shape, Strain};

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
        let diamonds = Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        };
        let clubs = Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        };
        let mut auction = bridge_core::Auction::new(bridge_core::Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        // We need to look at the auction from the next bidder's perspective?
        // If North bid 1C, next is East.
        // If we want to test Discovery for Responder (South), we need East to pass.
        // auction.add_call(Pass).
        // Then South bids.
        // Let's assume we are South (Partner of Opener).
        // Opener (North) bid 1C.
        // We are South.
        auction.add_call(Call::Pass); // East passes

        // Now at South.
        let auction_model = AuctionModel::from_auction(&auction, bridge_core::Position::South);

        // Manually set partner model min bits if needed, but from_auction might infer from 1C?
        // 1C opening typically shows Clubs?
        // If the engine knows 1C is standard, it infers length.
        // The "IsUnbidSuit" relies on `has_shown_suit`.
        // If `from_auction` uses a default interpreter that knows 1C shows clubs, then it works.
        // NBK's `from_auction` uses `RuleRegistry`?
        // If `RuleRegistry` is empty (new_natural was empty until I filled it), it might not know.
        // But I just filled it! So it SHOULD know `SuitOpening` or `Strong2C`.
        // `1C` matches `SuitOpening` (if 4th seat?) or `Strong2C`?
        // `Strong2C` is 2C.
        // `1C` is `SuitOpening`. Shows `MinLength(Clubs, 4)`.
        // So `partner_model` should have `Clubs >= 4`.
        // So `has_shown_suit(Clubs)` should be true.
        // So checks should work.

        // Override hand model in the test? No, hand model is local.
        // auction_model contains partner/bidder models.

        // This test logic in the original file was checking `get_semantics` result.
        // If semantics is None (rule doesn't apply) or constraints not satisfied.

        let diamond_semantics = NewSuitDiscovery.get_semantics(&auction_model, &diamonds);

        if let Some(s) = diamond_semantics {
            assert!(!hand_model.satisfies_all(s.shows));
        }

        let club_semantics = NewSuitDiscovery.get_semantics(&auction_model, &clubs);
        assert!(club_semantics.is_none());
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
        let h_bid = Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        };
        let s_bid = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            },
            min_hcp: Some(13),
            ..Default::default()
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
