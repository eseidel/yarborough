//! Auction state analysis for NBK

use bridge_core::{Auction, Call, Position, Strain};

/// Analysis of the current auction state
#[derive(Debug, Clone)]
pub struct AuctionModel {
    /// Whether the auction is currently forcing (partner's bid demands a response)
    pub is_forcing: bool,
}

impl AuctionModel {
    /// Analyze the auction to determine forcing status
    ///
    /// In NBK, bids are forcing when:
    /// - Partner made a new suit bid at 1 or 2 level after we've already bid (discovery)
    /// - Partner made a jump shift (showing strong hand)
    /// - We're in a game-forcing sequence
    ///
    /// Conservative approach: Most opening bids are not forcing unless responder has already shown values
    pub fn from_auction(auction: &Auction, partner_position: Position) -> Self {
        // Empty auction or all passes - not forcing
        if auction.calls.is_empty() || auction.calls.iter().all(|c| matches!(c, Call::Pass)) {
            return Self { is_forcing: false };
        }

        // Find partner's last bid (not Pass/Double/Redouble)
        let is_forcing = is_auction_forcing(auction, partner_position);

        Self { is_forcing }
    }
}

/// Determine if the auction is currently forcing
fn is_auction_forcing(auction: &Auction, partner_position: Position) -> bool {
    // Find partner's last non-pass call
    let dealer = auction.dealer;
    let mut current_pos = dealer;
    let mut partner_last_bid: Option<(u8, Strain)> = None;
    let mut we_have_bid = false;
    let our_position = partner_position.partner();

    for call in &auction.calls {
        if current_pos == partner_position {
            if let Call::Bid { level, strain } = call {
                partner_last_bid = Some((*level, *strain));
            }
        } else if current_pos == our_position {
            if matches!(call, Call::Bid { .. }) {
                we_have_bid = true;
            }
        }
        current_pos = current_pos.next();
    }

    // If partner hasn't made a bid yet, not forcing
    let Some((_level, _strain)) = partner_last_bid else {
        return false;
    };

    // For now, use simple forcing detection:
    // - If we haven't bid yet, partner's opening is not forcing (we can pass with weak hand)
    // - If we have bid, partner's new suit is forcing (discovery protocol)
    // - NT bids and raises are not forcing (limit protocol)

    // Conservative: only forcing if we've already shown values and partner bid a new suit
    // This will be refined as we implement the protocols
    if we_have_bid {
        // After we've responded, new bids by opener are forcing
        // (This is a simplification - will be refined in bid selector)
        true
    } else {
        // Opening bids are not forcing - responder can pass
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_auction_with_bids(dealer: Position, calls: Vec<Call>) -> Auction {
        let mut auction = Auction::new(dealer);
        for call in calls {
            auction.calls.push(call);
        }
        auction
    }

    #[test]
    fn test_empty_auction_not_forcing() {
        let auction = Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(!model.is_forcing);
    }

    #[test]
    fn test_opening_bid_not_forcing() {
        // North opens 1S - South (responder) can pass
        let auction = make_auction_with_bids(
            Position::North,
            vec![Call::Bid {
                level: 1,
                strain: Strain::Spades,
            }],
        );
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(!model.is_forcing); // Responder can pass weak hands
    }

    #[test]
    fn test_after_response_is_forcing() {
        // North opens 1S, East passes, South responds 2C, West passes
        // Now it's North's turn - is it forcing?
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::Spades,
                }, // North
                Call::Pass, // East
                Call::Bid {
                    level: 2,
                    strain: Strain::Clubs,
                }, // South (we responded)
                Call::Pass, // West
            ],
        );
        // From North's perspective (opener), after South responded
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(model.is_forcing); // Opener's rebid after response is forcing
    }

    #[test]
    fn test_all_passes_not_forcing() {
        let auction =
            make_auction_with_bids(Position::North, vec![Call::Pass, Call::Pass, Call::Pass]);
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(!model.is_forcing);
    }
}
