use crate::board::Position;
use crate::call::Call;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Auction {
    pub dealer: Position,
    pub calls: Vec<Call>,
}

impl Auction {
    pub fn new(dealer: Position) -> Self {
        Self {
            dealer,
            calls: Vec::new(),
        }
    }

    pub fn add_call(&mut self, call: Call) {
        self.calls.push(call);
    }

    pub fn current_player(&self) -> Position {
        let mut p = self.dealer;
        for _ in 0..self.calls.len() {
            p = p.next();
        }
        p
    }

    pub fn is_finished(&self) -> bool {
        if self.calls.len() < 4 {
            return false;
        }
        let last_three = &self.calls[self.calls.len() - 3..];
        last_three.iter().all(|c| matches!(c, Call::Pass)) && self.calls.len() >= 4
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strain::Strain;

    #[test]
    fn test_auction_finished() {
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid { level: 1, strain: Strain::Spades });
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        assert!(!auction.is_finished());
        auction.add_call(Call::Pass);
        assert!(auction.is_finished());
    }

    #[test]
    fn test_current_player() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_player(), Position::North);
        auction.add_call(Call::Pass);
        assert_eq!(auction.current_player(), Position::East);
    }
}
