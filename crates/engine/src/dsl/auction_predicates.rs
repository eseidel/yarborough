use crate::nbk::AuctionModel;
use std::fmt::Debug;
use types::Call;

pub trait AuctionPredicate: Send + Sync + Debug {
    fn check(&self, auction: &AuctionModel) -> bool;
}

pub fn not_auction(predicate: impl AuctionPredicate + 'static) -> NotAuction {
    NotAuction(Box::new(predicate))
}

#[derive(Debug)]
pub struct NotAuction(pub Box<dyn AuctionPredicate>);
impl AuctionPredicate for NotAuction {
    fn check(&self, model: &AuctionModel) -> bool {
        !self.0.check(model)
    }
}

#[derive(Debug)]
pub struct IsSeat(pub u8);
impl AuctionPredicate for IsSeat {
    fn check(&self, model: &AuctionModel) -> bool {
        model.auction.current_seat() == self.0
    }
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct IsOpen;
impl AuctionPredicate for IsOpen {
    fn check(&self, model: &AuctionModel) -> bool {
        model.auction.is_open()
    }
}

#[derive(Debug)]
pub struct IsNotOpen;
impl AuctionPredicate for IsNotOpen {
    fn check(&self, model: &AuctionModel) -> bool {
        !model.auction.is_open()
    }
}

#[derive(Debug)]
pub struct PartnerLimited;
impl AuctionPredicate for PartnerLimited {
    fn check(&self, model: &AuctionModel) -> bool {
        model.partner_hand().max_hcp.is_some()
    }
}

#[derive(Debug)]
pub struct WeOpened;
impl AuctionPredicate for WeOpened {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .opener()
            .map(|p| p.partnership() == model.auction.current_partnership())
            .unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct TheyOpened;
impl AuctionPredicate for TheyOpened {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .opener()
            .map(|p| p.partnership() == model.auction.current_partnership().opponent())
            .unwrap_or(false)
    }
}

/// Checks that RHO's call (the last call in the auction) was not a pass.
/// This identifies "direct seat" — we are acting immediately after an opponent's action.
#[derive(Debug)]
pub struct RhoMadeLastBid;
impl AuctionPredicate for RhoMadeLastBid {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .calls
            .last()
            .map(|call| !matches!(call, Call::Pass))
            .unwrap_or(false)
    }
}

/// Checks that our partnership has only passed (no bids, doubles, or redoubles).
#[derive(Debug)]
pub struct WeHaveOnlyPassed;
impl AuctionPredicate for WeHaveOnlyPassed {
    fn check(&self, model: &AuctionModel) -> bool {
        let our_partnership = model.auction.current_partnership();
        for (position, call) in model.auction.iter() {
            if position.partnership() == our_partnership && !matches!(call, Call::Pass) {
                return false;
            }
        }
        true
    }
}

/// Checks that the last bid in the auction is at most the given level.
#[derive(Debug)]
pub struct LastBidMaxLevel(pub u8);
impl AuctionPredicate for LastBidMaxLevel {
    fn check(&self, model: &AuctionModel) -> bool {
        let mut last_level = None;
        for (_, call) in model.auction.iter() {
            if let Call::Bid { level, .. } = call {
                last_level = Some(*level);
            }
        }
        last_level.map(|l| l <= self.0).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::{Call, Position, Strain};

    #[test]
    fn test_we_opened_they_opened() {
        let mut auction = types::Auction::new(Position::North);
        // North (NS) passes
        auction.add_call(Call::Pass);
        // East (EW) bids 1C
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });

        // Now it's South's (NS) turn
        let model = AuctionModel::from_auction(&auction);

        let we = WeOpened;
        let they = TheyOpened;

        // EW opened, South is NS, so "they" opened.
        assert!(!we.check(&model));
        assert!(they.check(&model));

        // Let South pass
        auction.add_call(Call::Pass);
        // West (EW) bids 2C
        auction.add_call(Call::Bid {
            level: 2,
            strain: Strain::Clubs,
        });

        // Now it's North's turn (NS)
        let model_north = AuctionModel::from_auction(&auction);
        // EW still opened. North is NS. So "they" opened.
        assert!(!we.check(&model_north));
        assert!(they.check(&model_north));

        // If North had opened 1S
        let mut auction2 = types::Auction::new(Position::North);
        auction2.add_call(Call::Bid {
            level: 1,
            strain: Strain::Spades,
        });
        // East's turn
        let model_east = AuctionModel::from_auction(&auction2);
        // North (NS) opened. East is EW. So "they" opened.
        assert!(!we.check(&model_east));
        assert!(they.check(&model_east));

        // West's turn after N: 1S, E: Pass, S: 2S, W: ?
        auction2.add_call(Call::Pass);
        auction2.add_call(Call::Bid {
            level: 2,
            strain: Strain::Spades,
        });
        let model_west = AuctionModel::from_auction(&auction2);
        // North (NS) opened. West is EW. So "they" opened.
        assert!(!we.check(&model_west));
        assert!(they.check(&model_west));
    }

    #[test]
    fn test_rho_made_last_bid() {
        let pred = RhoMadeLastBid;

        // N opens 1C, E's turn — RHO (N) made the last bid
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "E is in direct seat after N's 1C");

        // N: 1S, E: P, S: P, W's turn — last bid was N (LHO), not RHO
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Spades,
        });
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "W is in balancing seat, not direct seat"
        );

        // N: 1C, E: P, S: 1S, W's turn — last bid was S (RHO)
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        auction.add_call(Call::Pass);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Spades,
        });
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "W is in direct seat after S's 1S");

        // N: 1C, E: X, S: P, W's turn — last non-pass was E (partner's double), not RHO
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        auction.add_call(Call::Double);
        auction.add_call(Call::Pass);
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "Last non-pass was E's double, not RHO (S)"
        );
    }

    #[test]
    fn test_we_have_only_passed() {
        let pred = WeHaveOnlyPassed;

        // Empty auction — no one has bid
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N opens 1D, E's turn — EW has only passed
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1D, E: 1H, S: P, W's turn — EW HAS bid (E bid 1H)
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        });
        auction.add_call(Call::Pass);
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // N: P, E: P, S's turn — NS has only passed
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1C, E: X, S: P, W's turn — EW has doubled (not only passed)
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        auction.add_call(Call::Double);
        auction.add_call(Call::Pass);
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }

    #[test]
    fn test_last_bid_max_level() {
        let pred = LastBidMaxLevel(1);

        // N opens 1C — last bid is level 1
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N opens 2D — last bid is level 2, exceeds max
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 2,
            strain: Strain::Diamonds,
        });
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // Empty auction — no bids at all
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }
}
