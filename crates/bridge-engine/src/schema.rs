use serde::{Deserialize, Serialize};
use bridge_core::suit::Suit;

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
    pub opening: Vec<BidRule>,
    // Add other contexts later: response, competitive, etc.
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
    IsBalanced { balanced: bool }, 
}
