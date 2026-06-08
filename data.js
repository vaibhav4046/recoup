window.RO_FALLBACK = {
  "mode": "partial",
  "integrations": {
    "gemini": "live",
    "mongodb": "fallback"
  },
  "scan": {
    "findings": [
      {
        "id": "f_sub_1",
        "kind": "dead_subscription",
        "title": "Cancel StreamMax Premium",
        "cadence": "yearly",
        "amount": 239.88,
        "currency": "$",
        "amount_label": "$240/yr",
        "unit_note": "$19.99/mo",
        "rule": "dead_sub",
        "evidence": "Unused 142 days · billing since 2023-04",
        "action": "cancel",
        "priority": "high"
      },
      {
        "id": "f_sub_3",
        "kind": "dead_subscription",
        "title": "Cancel FitPlus Gym App",
        "cadence": "yearly",
        "amount": 179.88,
        "currency": "$",
        "amount_label": "$180/yr",
        "unit_note": "$14.99/mo",
        "rule": "dead_sub",
        "evidence": "Unused 210 days · billing since 2024-02",
        "action": "cancel",
        "priority": "high"
      },
      {
        "id": "f_sub_4",
        "kind": "price_creep",
        "title": "Challenge NewsDaily+ price hike",
        "cadence": "yearly",
        "amount": 60.0,
        "currency": "$",
        "amount_label": "$60/yr",
        "unit_note": "$5.00/mo",
        "rule": "price_creep",
        "evidence": "Rose $7.99→$12.99/mo",
        "action": "dispute_price",
        "priority": "medium"
      },
      {
        "id": "f_bill_1",
        "kind": "billing_error",
        "title": "Dispute MobileCo wireless overcharge",
        "cadence": "yearly",
        "amount": 276.0,
        "currency": "$",
        "amount_label": "$276/yr",
        "unit_note": "$23.00/mo",
        "rule": "billing_error",
        "evidence": "duplicate line fee on a $78.40 bill",
        "action": "dispute_charge",
        "priority": "high"
      },
      {
        "id": "f_pur_1",
        "kind": "price_drop",
        "title": "Claim price-drop refund: Noise-cancel headphones",
        "cadence": "once",
        "amount": 70.0,
        "currency": "$",
        "amount_label": "$70",
        "unit_note": "one-time",
        "rule": "refund_window",
        "evidence": "Bought $299 6d ago · now $229",
        "action": "request_refund",
        "priority": "medium"
      },
      {
        "id": "f_flt_1",
        "kind": "flight_comp",
        "title": "Claim flight delay compensation (LHR→BCN)",
        "cadence": "once",
        "amount": 250.0,
        "currency": "€",
        "amount_label": "€250",
        "unit_note": "one-time",
        "rule": "eu261",
        "evidence": "LHR→BCN (1137km) delayed 4h on an EU carrier",
        "action": "file_claim",
        "priority": "high"
      },
      {
        "id": "f_set_1",
        "kind": "settlement",
        "title": "Claim: Amazon Prime / FTC settlement",
        "cadence": "once",
        "amount": 51.0,
        "currency": "$",
        "amount_label": "$51",
        "unit_note": "one-time",
        "rule": "settlement",
        "evidence": "open claim window",
        "action": "file_claim",
        "priority": "medium"
      },
      {
        "id": "f_unc_1",
        "kind": "unclaimed",
        "title": "Claim: State unclaimed property (utility deposit)",
        "cadence": "once",
        "amount": 214.0,
        "currency": "$",
        "amount_label": "$214",
        "unit_note": "one-time",
        "rule": "unclaimed",
        "evidence": "NAUPA",
        "action": "file_claim",
        "priority": "medium"
      }
    ],
    "recurring_year": 755.76,
    "one_time": 585.0,
    "total_recoverable": 1340.76,
    "surface": {
      "subscriptions": [
        {
          "id": "sub_1",
          "name": "StreamMax Premium",
          "monthly": 19.99,
          "last_used_days": 142,
          "since": "2023-04"
        },
        {
          "id": "sub_2",
          "name": "CloudStore 2TB",
          "monthly": 9.99,
          "last_used_days": 8,
          "since": "2022-01"
        },
        {
          "id": "sub_3",
          "name": "FitPlus Gym App",
          "monthly": 14.99,
          "last_used_days": 210,
          "since": "2024-02"
        },
        {
          "id": "sub_4",
          "name": "NewsDaily+",
          "monthly": 12.99,
          "last_used_days": 20,
          "since": "2023-09",
          "old_monthly": 7.99
        }
      ],
      "bills": [
        {
          "id": "bill_1",
          "name": "MobileCo wireless",
          "amount": 78.4,
          "issue": "duplicate_line_fee",
          "overcharge": 23.0
        },
        {
          "id": "bill_2",
          "name": "PowerGrid electric",
          "amount": 134.1,
          "issue": null,
          "overcharge": 0
        }
      ],
      "purchases": [
        {
          "id": "pur_1",
          "name": "Noise-cancel headphones",
          "price": 299.0,
          "days_ago": 6,
          "price_now": 229.0,
          "store": "ElectroMart"
        }
      ],
      "flights": [
        {
          "id": "flt_1",
          "carrier": "EU carrier",
          "route": "LHR→BCN",
          "distance_km": 1137,
          "delay_hours": 4,
          "fare": 180.0,
          "owed": 250.0
        }
      ],
      "matches": [
        {
          "id": "set_1",
          "type": "settlement",
          "name": "Amazon Prime / FTC settlement",
          "est_payout": 51.0,
          "deadline": "open"
        },
        {
          "id": "unc_1",
          "type": "unclaimed",
          "name": "State unclaimed property (utility deposit)",
          "est_payout": 214.0,
          "source": "NAUPA"
        }
      ]
    }
  },
  "actions": [
    {
      "id": "act_1",
      "finding_id": "f_sub_1",
      "kind": "dead_subscription",
      "title": "Cancel StreamMax Premium",
      "verb": "Cancel",
      "amount": 239.88,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$240/yr",
      "unit_note": "$19.99/mo",
      "priority": "high",
      "evidence": "Unused 142 days · billing since 2023-04",
      "rule": "dead_sub",
      "draft": "Subject: Cancel my subscription — effective immediately\n\nPlease cancel my plan and confirm in writing, including any proration owed. It has gone unused (Unused 142 days · billing since 2023-04). This stops a recurring leak of $240/yr.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_2",
      "finding_id": "f_sub_3",
      "kind": "dead_subscription",
      "title": "Cancel FitPlus Gym App",
      "verb": "Cancel",
      "amount": 179.88,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$180/yr",
      "unit_note": "$14.99/mo",
      "priority": "high",
      "evidence": "Unused 210 days · billing since 2024-02",
      "rule": "dead_sub",
      "draft": "Subject: Cancel my subscription — effective immediately\n\nPlease cancel my plan and confirm in writing, including any proration owed. It has gone unused (Unused 210 days · billing since 2024-02). This stops a recurring leak of $180/yr.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_3",
      "finding_id": "f_sub_4",
      "kind": "price_creep",
      "title": "Challenge NewsDaily+ price hike",
      "verb": "Challenge",
      "amount": 60.0,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$60/yr",
      "unit_note": "$5.00/mo",
      "priority": "medium",
      "evidence": "Rose $7.99→$12.99/mo",
      "rule": "price_creep",
      "draft": "Subject: Apply current rate or cancel\n\nMy price rose (Rose $7.99→$12.99/mo). Please match the current new-customer / retention rate, or treat this as notice of cancellation. Recovers $60/yr. Basis: Silent price increases can be challenged or matched to the new-customer rate (retention offer).",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_4",
      "finding_id": "f_bill_1",
      "kind": "billing_error",
      "title": "Dispute MobileCo wireless overcharge",
      "verb": "Dispute",
      "amount": 276.0,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$276/yr",
      "unit_note": "$23.00/mo",
      "priority": "high",
      "evidence": "duplicate line fee on a $78.40 bill",
      "rule": "billing_error",
      "draft": "Subject: Dispute an incorrect charge\n\nThere is an erroneous charge on my account (duplicate line fee on a $78.40 bill). Please remove it and credit me — worth $276/yr if recurring. Basis: Duplicate charges / undisclosed fees are recoverable; card issuers allow chargebacks within 60–120 days.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_5",
      "finding_id": "f_pur_1",
      "kind": "price_drop",
      "title": "Claim price-drop refund: Noise-cancel headphones",
      "verb": "Refund",
      "amount": 70.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$70",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "Bought $299 6d ago · now $229",
      "rule": "refund_window",
      "draft": "Subject: Price-protection refund request\n\nBought $299 6d ago · now $229. Per your price-protection / refund-window policy, please refund the one-time difference of $70. Basis: Many retailers and airlines owe a refund for a price drop or cancellation within a stated window.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_6",
      "finding_id": "f_flt_1",
      "kind": "flight_comp",
      "title": "Claim flight delay compensation (LHR→BCN)",
      "verb": "File claim",
      "amount": 250.0,
      "cadence": "once",
      "currency": "€",
      "amount_label": "€250",
      "unit_note": "one-time",
      "priority": "high",
      "evidence": "LHR→BCN (1137km) delayed 4h on an EU carrier",
      "rule": "eu261",
      "draft": "Subject: EU261 delay compensation claim\n\nMy flight LHR→BCN (1137km) delayed 4h on an EU carrier. Under EU261/UK261 I am owed €250 in cash compensation (one-time, not a voucher). Please process. Basis: EU261/UK261: flights delayed 3h+ owe €250 (<1500km), €400 (1500–3500km), or €600 cash.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_7",
      "finding_id": "f_set_1",
      "kind": "settlement",
      "title": "Claim: Amazon Prime / FTC settlement",
      "verb": "File claim",
      "amount": 51.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$51",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "open claim window",
      "rule": "settlement",
      "draft": "Filing my consumer claim (open claim window) for a one-time $51. Basis: Open class-action settlements (e.g. the $1.5B Amazon Prime / FTC fund) pay eligible consumers who file.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_8",
      "finding_id": "f_unc_1",
      "kind": "unclaimed",
      "title": "Claim: State unclaimed property (utility deposit)",
      "verb": "File claim",
      "amount": 214.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$214",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "NAUPA",
      "rule": "unclaimed",
      "draft": "Filing to recover property held in my name (NAUPA), a one-time $214. Basis: State unclaimed-property programs (NAUPA) hold forgotten deposits, refunds, and balances under your name.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    }
  ],
  "run": {
    "run_id": "run_7a7aa5",
    "model": "deterministic-fallback",
    "live": false,
    "latency_ms": 1460,
    "actions": 8,
    "created_at": "2026-06-08T18:24:44.538604+00:00"
  },
  "reasoning": [
    {
      "t": "Scanned money surface — 8 recoverable items found",
      "tone": "cyan"
    },
    {
      "t": "Recurring leaks: 4 worth $756/yr",
      "tone": "warn"
    },
    {
      "t": "Owed to you (one-time): 4 worth ~$585",
      "tone": "warn"
    },
    {
      "t": "Each finding cites a real consumer-protection rule",
      "tone": "dim"
    },
    {
      "t": "Drafted 8 claims — every one needs your approval before it sends",
      "tone": "cyan"
    },
    {
      "t": "One-time payouts are never annualized; amounts come from the rules, not the model",
      "tone": "ok"
    }
  ],
  "totals": {
    "approved_recurring_year": 0,
    "approved_one_time": 0,
    "pending_recurring_year": 755.76,
    "pending_one_time": 585.0
  },
  "recurring_year": 755.76,
  "one_time": 585.0,
  "recoverable": 1340.76,
  "audit": [
    {
      "event_id": "au_0001",
      "actor_type": "system",
      "actor_name": "Recoup scanner",
      "event_type": "SCAN_RUN",
      "label": "Scanned money surface — 8 items: $756/yr recurring + $585 one-time",
      "evidence_ref": "",
      "amount": 1340.76,
      "trace_id": "",
      "timestamp": "2026-06-08T18:24:43.078147+00:00",
      "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
      "hash": "442fbf7d08704708d884e9c00fd556e0606a76a4a39da2c39ddaffb48dfbfcae"
    },
    {
      "event_id": "au_0002",
      "actor_type": "agent",
      "actor_name": "Gemini agent",
      "event_type": "PLAN_DRAFTED",
      "label": "8 claims drafted (fallback)",
      "evidence_ref": "",
      "amount": 0.0,
      "trace_id": "",
      "timestamp": "2026-06-08T18:24:44.538550+00:00",
      "prev_hash": "442fbf7d08704708d884e9c00fd556e0606a76a4a39da2c39ddaffb48dfbfcae",
      "hash": "847eb46e90827b4488f955578a804db200d1a211bfdea3ce156e07793a562b90"
    }
  ],
  "auditIntegrity": {
    "intact": true,
    "count": 2,
    "head": "847eb46e90827b4488f955578a804db200d1a211bfdea3ce156e07793a562b90"
  },
  "generated": "static-fallback"
};
