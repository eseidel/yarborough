use crate::strain::Strain;
use crate::suit::Suit;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Call {
    Pass,
    Double,
    Redouble,
    Bid { level: u8, strain: Strain },
}

impl Call {
    pub fn is_bid(&self) -> bool {
        matches!(self, Call::Bid { .. })
    }

    /// Returns the level of this call, if it's a bid.
    pub fn level(&self) -> Option<u8> {
        match self {
            Call::Bid { level, .. } => Some(*level),
            _ => None,
        }
    }

    /// Returns the strain of this call, if it's a bid.
    pub fn strain(&self) -> Option<Strain> {
        match self {
            Call::Bid { strain, .. } => Some(*strain),
            _ => None,
        }
    }

    /// Returns the suit of this call, if it's a suited bid.
    pub fn suit(&self) -> Option<Suit> {
        self.strain().and_then(|s| s.to_suit())
    }

    pub fn render(self) -> String {
        match self {
            Call::Pass => "P".to_string(),
            Call::Double => "X".to_string(),
            Call::Redouble => "XX".to_string(),
            Call::Bid { level, strain } => format!("{}{}", level, strain.to_char()),
        }
    }
}

impl FromStr for Call {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.trim().to_ascii_uppercase();
        if s == "P" || s == "PASS" {
            return Ok(Call::Pass);
        }
        if s == "X" || s == "DBL" || s == "DOUBLE" {
            return Ok(Call::Double);
        }
        if s == "XX" || s == "RDBL" || s == "REDOUBLE" {
            return Ok(Call::Redouble);
        }
        if s.len() >= 2 {
            let level_char = s.chars().next().ok_or(())?;
            let level = level_char.to_digit(10).ok_or(())? as u8;
            if (1..=7).contains(&level) {
                let strain_char = s.chars().nth(1).ok_or(())?;
                if let Some(strain) = Strain::from_char(strain_char) {
                    return Ok(Call::Bid { level, strain });
                }
            }
        }
        Err(())
    }
}

impl fmt::Display for Call {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.render())
    }
}
