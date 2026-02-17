use crate::kernel::AuctionModel;
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

/// Checks that RHO made the last bid in the auction.
/// This identifies "direct seat" — we are acting immediately after an opponent's bid.
#[derive(Debug)]
pub struct RhoMadeLastBid;
impl AuctionPredicate for RhoMadeLastBid {
    fn check(&self, model: &AuctionModel) -> bool {
        let rho = model.auction.current_player().rho();
        model.auction.last_bidder() == Some(rho)
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
    use types::Position;

    #[test]
    fn test_we_opened_they_opened() {
        let mut auction = types::Auction::bidding(Position::North, "P 1C");

        // Now it's South's (NS) turn
        let model = AuctionModel::from_auction(&auction);

        let we = WeOpened;
        let they = TheyOpened;

        // EW opened, South is NS, so "they" opened.
        assert!(!we.check(&model));
        assert!(they.check(&model));

        // Let South pass, West (EW) bids 2C
        auction.bids("P 2C");

        // Now it's North's turn (NS)
        let model_north = AuctionModel::from_auction(&auction);
        // EW still opened. North is NS. So "they" opened.
        assert!(!we.check(&model_north));
        assert!(they.check(&model_north));

        // If North had opened 1S
        let mut auction2 = types::Auction::bidding(Position::North, "1S");
        // East's turn
        let model_east = AuctionModel::from_auction(&auction2);
        // North (NS) opened. East is EW. So "they" opened.
        assert!(!we.check(&model_east));
        assert!(they.check(&model_east));

        // West's turn after N: 1S, E: Pass, S: 2S, W: ?
        auction2.bids("P 2S");
        let model_west = AuctionModel::from_auction(&auction2);
        // North (NS) opened. West is EW. So "they" opened.
        assert!(!we.check(&model_west));
        assert!(they.check(&model_west));
    }

    #[test]
    fn test_rho_made_last_bid() {
        let pred = RhoMadeLastBid;

        // N opens 1C, E's turn — RHO (N) made the last bid
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "E is in direct seat after N's 1C");

        // N: 1S, E: P, S: P, W's turn — last bid was N (LHO), not RHO
        let auction = types::Auction::bidding(Position::North, "1S P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "W is in balancing seat, not direct seat"
        );

        // N: 1C, E: P, S: 1S, W's turn — last bid was S (RHO)
        let auction = types::Auction::bidding(Position::North, "1C P 1S");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "W is in direct seat after S's 1S");

        // N: 1C, E: X, S: P, W's turn — last bidder is N (LHO), not RHO
        // E's double is not a bid, so it doesn't count
        let auction = types::Auction::bidding(Position::North, "1C X P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "Double is not a bid — last bidder is N (LHO), not RHO (S)"
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
        let mut auction = types::Auction::bidding(Position::North, "1D");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1D, E: 1H, S: P, W's turn — EW HAS bid (E bid 1H)
        auction.bids("1H P");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // N: P, E: P, S's turn — NS has only passed
        let auction = types::Auction::bidding(Position::North, "P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1C, E: X, S: P, W's turn — EW has doubled (not only passed)
        let auction = types::Auction::bidding(Position::North, "1C X P");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }

    #[test]
    fn test_last_bid_max_level() {
        let pred = LastBidMaxLevel(1);

        // N opens 1C — last bid is level 1
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N opens 2D — last bid is level 2, exceeds max
        let auction = types::Auction::bidding(Position::North, "2D");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // Empty auction — no bids at all
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }
}
