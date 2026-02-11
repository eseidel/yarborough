use bridge_core::suit::Suit;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_constraint() {
        let yaml = "
type: MinHCP
min: 12
";
        let c: Constraint = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(c, Constraint::MinHCP { min: 12 });
    }

    #[test]
    fn test_deserialize_rule() {
        let yaml = "
call: 'P'
variants:
  - name: 'Pass'
    priority: 1
    description: 'Less than 12 HCP'
    constraints:
      - type: MaxHCP
        max: 11
";
        let r: BidRule = serde_yaml::from_str(yaml).unwrap();
        match &r.variants[0].constraints[0] {
            Constraint::MaxHCP { max } => assert_eq!(*max, 11),
            _ => panic!("Wrong variant"),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct System {
    #[serde(default)]
    pub opening: Vec<BidRule>,
    #[serde(default)]
    pub responses: Vec<Situation>,
}

impl System {
    pub fn merge(&mut self, other: System) {
        self.opening.extend(other.opening);
        self.responses.extend(other.responses);
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct Situation {
    pub pattern: String,
    pub rules: Vec<BidRule>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct BidRule {
    pub call: String,
    pub variants: Vec<Variant>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct Variant {
    pub name: String,
    pub priority: u8,
    pub description: String,
    pub constraints: Vec<Constraint>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum Constraint {
    MinHCP { min: u8 },
    MaxHCP { max: u8 },
    MinLength { suit: Suit, count: u8 },
    MaxLength { suit: Suit, count: u8 },
    ExactLength { suit: Suit, count: u8 },
    IsBalanced { balanced: bool },
    RuleOfTwenty { met: bool },
}
