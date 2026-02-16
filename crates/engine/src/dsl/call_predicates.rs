use crate::nbk::AuctionModel;
use std::fmt::Debug;
use types::{Call, Strain};

pub trait CallPredicate: Send + Sync + Debug {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool;
}

#[derive(Debug)]
pub struct NotCall(pub Box<dyn CallPredicate>);
impl CallPredicate for NotCall {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        !self.0.check(auction, call)
    }
}

pub fn not_call(predicate: impl CallPredicate + 'static) -> NotCall {
    NotCall(Box::new(predicate))
}

#[derive(Debug)]
pub struct IsLevel(pub u8);
impl CallPredicate for IsLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, .. } => *level == self.0,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsCall(pub u8, pub Strain);
impl CallPredicate for IsCall {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, strain } => *level == self.0 && *strain == self.1,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsStrain(pub Strain);
impl CallPredicate for IsStrain {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => *strain == self.0,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsNoTrump;
impl CallPredicate for IsNoTrump {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        matches!(
            call,
            Call::Bid {
                strain: Strain::NoTrump,
                ..
            }
        )
    }
}

#[derive(Debug)]
pub struct IsSuit;
impl CallPredicate for IsSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => strain.to_suit().is_some(),
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsNewSuit;
impl CallPredicate for IsNewSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => {
                if let Some(suit) = strain.to_suit() {
                    !auction.partner_model.has_shown_suit(suit)
                        && !auction.bidder_model.has_shown_suit(suit)
                } else {
                    false
                }
            }
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsMajorSuit;
impl CallPredicate for IsMajorSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => strain.is_major(),
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsMinorSuit;
impl CallPredicate for IsMinorSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => strain.is_minor(),
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct MinLevel(pub u8);
impl CallPredicate for MinLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, .. } => *level >= self.0,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsPass;
impl CallPredicate for IsPass {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        matches!(call, Call::Pass)
    }
}

#[derive(Debug)]
pub struct BidderHasShownSuit;
impl CallPredicate for BidderHasShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return auction.bidder_model.has_shown_suit(suit);
            }
        }
        false
    }
}

#[derive(Debug)]
pub struct PartnerHasShownSuit;
impl CallPredicate for PartnerHasShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return auction.partner_model.has_shown_suit(suit);
            }
        }
        false
    }
}

/// Checks that no opponent has bid in the same suit as this call.
#[derive(Debug)]
pub struct OpponentHasNotBidSuit;
impl CallPredicate for OpponentHasNotBidSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        let our_suit = match call {
            Call::Bid { strain, .. } => match strain.to_suit() {
                Some(s) => s,
                None => return true, // NT bids are fine
            },
            _ => return true,
        };

        let our_partnership = auction.auction.current_partnership();
        for (position, opponent_call) in auction.auction.iter() {
            if position.partnership() == our_partnership {
                continue; // Skip our side's calls
            }
            if let Call::Bid { strain, .. } = opponent_call {
                if strain.to_suit() == Some(our_suit) {
                    return false; // Opponent has bid this suit
                }
            }
        }
        true
    }
}
