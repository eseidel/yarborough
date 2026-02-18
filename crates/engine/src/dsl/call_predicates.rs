use crate::kernel::AuctionModel;
use std::fmt::Debug;
use types::{Call, Position, Strain};

pub trait CallPredicate: Send + Sync + Debug {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool;
}

#[derive(Debug)]
pub struct NotCall(pub Box<dyn CallPredicate>);
impl CallPredicate for NotCall {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        !self.0.check(model, call)
    }
}

pub fn not_call(predicate: impl CallPredicate + 'static) -> NotCall {
    NotCall(Box::new(predicate))
}

#[derive(Debug)]
pub struct IsLevel(pub u8);
impl CallPredicate for IsLevel {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.level() == Some(self.0)
    }
}

#[derive(Debug)]
pub struct IsLevelRange(pub u8, pub u8);
impl CallPredicate for IsLevelRange {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.level()
            .map(|l| l >= self.0 && l <= self.1)
            .unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct IsCall(pub u8, pub Strain);
impl CallPredicate for IsCall {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        let (level, strain) = (self.0, self.1);
        call.level() == Some(level) && call.strain() == Some(strain)
    }
}

#[derive(Debug)]
pub struct IsStrain(pub Strain);
impl CallPredicate for IsStrain {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.strain() == Some(self.0)
    }
}

#[derive(Debug)]
pub struct IsNotrump;
impl CallPredicate for IsNotrump {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.strain() == Some(Strain::Notrump)
    }
}

#[derive(Debug)]
pub struct IsSuit;
impl CallPredicate for IsSuit {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.suit().is_some()
    }
}

#[derive(Debug)]
pub struct IsNewSuit;
impl CallPredicate for IsNewSuit {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            Position::ALL
                .iter()
                .all(|p| !model.hand(*p).has_shown_suit(suit))
        } else {
            false
        }
    }
}

#[derive(Debug)]
pub struct IsMajorSuit;
impl CallPredicate for IsMajorSuit {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.strain().map(|s| s.is_major()).unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct IsMinorSuit;
impl CallPredicate for IsMinorSuit {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.strain().map(|s| s.is_minor()).unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct MinLevel(pub u8);
impl CallPredicate for MinLevel {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.level().map(|l| l >= self.0).unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct MaxLevel(pub u8);
impl CallPredicate for MaxLevel {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        call.level().map(|l| l <= self.0).unwrap_or(false)
    }
}

/// Returns the minimum legal level for a given strain, based on the last bid in the auction.
/// Returns None if there is no previous bid.
fn min_level_for_strain(model: &AuctionModel, strain: Strain) -> Option<u8> {
    let (_, last) = model.auction.last_bid()?;
    let last_level = last.level()?;
    let last_strain = last.strain()?;
    Some(if strain > last_strain {
        last_level
    } else {
        last_level + 1
    })
}

/// Checks if a bid is a jump (at least one level higher than necessary).
#[derive(Debug)]
pub struct IsJump;
impl CallPredicate for IsJump {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let (Some(level), Some(strain)) = (call.level(), call.strain()) {
            if let Some(min_level) = min_level_for_strain(model, strain) {
                return level == min_level + 1;
            }
        }
        false
    }
}

#[derive(Debug)]
pub struct IsPass;
impl CallPredicate for IsPass {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        matches!(call, Call::Pass)
    }
}

#[derive(Debug)]
pub struct BidderHasShownSuit;
impl CallPredicate for BidderHasShownSuit {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            return model.bidder_hand().has_shown_suit(suit);
        }
        false
    }
}

#[derive(Debug)]
pub struct PartnerHasShownSuit;
impl CallPredicate for PartnerHasShownSuit {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            return model.partner_hand().has_shown_suit(suit);
        }
        false
    }
}

#[derive(Debug)]
pub struct IsDouble;
impl CallPredicate for IsDouble {
    fn check(&self, _model: &AuctionModel, call: &Call) -> bool {
        matches!(call, Call::Double)
    }
}

/// Checks that no opponent has shown the same suit as this call.
/// Uses opponent HandModels (semantic meaning) rather than raw bid strains,
/// so conventional bids like Stayman (2C) won't be treated as showing clubs.
#[derive(Debug)]
pub struct OpponentHasNotShownSuit;
impl CallPredicate for OpponentHasNotShownSuit {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            return !model.lho_hand().has_shown_suit(suit)
                && !model.rho_hand().has_shown_suit(suit);
        }
        true
    }
}

#[derive(Debug)]
pub struct CuebidLhoSuit;
impl CallPredicate for CuebidLhoSuit {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let Some(strain) = call.strain() {
            return model.auction.lho_last_call().and_then(|c| c.strain()) == Some(strain);
        }
        false
    }
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct CuebidRhoSuit;
impl CallPredicate for CuebidRhoSuit {
    fn check(&self, model: &AuctionModel, call: &Call) -> bool {
        if let Some(strain) = call.strain() {
            return model.auction.rho_last_call().and_then(|c| c.strain()) == Some(strain);
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::Position;

    #[test]
    fn test_cuebid_predicates() {
        // North opens 1D. East is LHO.
        let auction = types::Auction::bidding(Position::North, "1D");
        let model = AuctionModel::from_auction(&auction);

        let call_2d = Call::Bid {
            level: 2,
            strain: types::Strain::Diamonds,
        };
        let call_2s = Call::Bid {
            level: 2,
            strain: types::Strain::Spades,
        };

        // For East:
        // LHO is South (has not bid)
        // RHO is North (bid 1D)

        assert!(CuebidRhoSuit.check(&model, &call_2d));
        assert!(!CuebidRhoSuit.check(&model, &call_2s));

        assert!(!CuebidLhoSuit.check(&model, &call_2d));
    }
}
