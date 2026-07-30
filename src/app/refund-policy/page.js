import LegalPage, {
  LegalSection,
} from '@/components/LegalPage';

export const metadata = {
  title: 'Refund Policy',
  description:
    'BeatMarket refund eligibility, review, processing, and access rules.',
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      lastUpdated="July 30, 2026"
    >
      <p
        style={{
          margin: 0,
          color: '#374151',
        }}
      >
        This Refund Policy explains when a
        BeatMarket purchase may qualify for a
        refund, how refund requests are
        reviewed, and what happens after a
        refund is completed.
      </p>

      <p
        style={{
          margin: '18px 0 0',
          color: '#374151',
        }}
      >
        Because BeatMarket provides digital
        audio files and licenses that may
        become accessible immediately after
        payment, purchases are generally final
        except where a refund is required by
        law or approved under this Policy.
      </p>

      <LegalSection title="1. Refund eligibility">
        <p style={{ margin: 0 }}>
          A refund may be considered when:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            the buyer was charged but the
            order was not completed;
          </li>

          <li>
            the same transaction was charged
            more than once;
          </li>

          <li>
            the purchased files cannot be
            accessed because of a confirmed
            BeatMarket technical failure;
          </li>

          <li>
            the delivered files materially
            differ from the purchased listing;
          </li>

          <li>
            the purchase was made through
            unauthorized account or payment
            activity;
          </li>

          <li>
            the beat or license cannot lawfully
            be supplied because of a confirmed
            ownership or rights problem;
          </li>

          <li>
            applicable consumer law requires a
            refund.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Purchases generally not eligible">
        <p style={{ margin: 0 }}>
          A refund will generally not be
          approved solely because:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            the buyer changed their mind;
          </li>

          <li>
            the buyer no longer wants or needs
            the beat;
          </li>

          <li>
            the buyer selected the wrong beat
            or license;
          </li>

          <li>
            the buyer did not review the audio
            preview, description, price, or
            license terms before purchasing;
          </li>

          <li>
            the buyer&apos;s software,
            hardware, device, or internet
            connection cannot use the supplied
            files;
          </li>

          <li>
            the buyer expected rights that are
            not included in the purchased
            license;
          </li>

          <li>
            the buyer&apos;s project, release,
            monetization, or distribution plan
            changed;
          </li>

          <li>
            the buyer has already downloaded,
            copied, distributed, published, or
            commercially used the files.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Exclusive-license purchases">
        <p style={{ margin: 0 }}>
          Exclusive-license purchases require
          additional review because completion
          may remove the beat from future
          marketplace availability.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Approval of an Exclusive-license
          refund may depend on whether the
          files were accessed, whether the
          license was used, whether third-party
          rights are affected, and whether the
          beat can safely and lawfully be
          restored to sale.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Refunding an Exclusive purchase does
          not automatically guarantee that the
          beat will immediately become
          available again.
        </p>
      </LegalSection>

      <LegalSection title="4. How to request a refund">
        <p style={{ margin: 0 }}>
          A refund request should be submitted
          through BeatMarket&apos;s official
          support channel and should include:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            the email address associated with
            the buyer account;
          </li>

          <li>
            the order or transaction
            identifier;
          </li>

          <li>
            the beat and license involved;
          </li>

          <li>
            a clear explanation of the
            problem;
          </li>

          <li>
            relevant screenshots, payment
            records, error messages, or other
            evidence.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket may request additional
          information to verify identity,
          payment ownership, account activity,
          file access, or the reason for the
          request.
        </p>
      </LegalSection>

      <LegalSection title="5. Request timing">
        <p style={{ margin: 0 }}>
          Refund requests should be submitted
          as soon as reasonably possible after
          the buyer becomes aware of the
          problem.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Delayed requests may be harder to
          verify, particularly when files have
          been downloaded or the license has
          already been used.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Any mandatory legal refund or
          withdrawal period that applies to a
          transaction will take priority over
          this operational Policy.
        </p>
      </LegalSection>

      <LegalSection title="6. Review process">
        <p style={{ margin: 0 }}>
          BeatMarket may review:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            payment-provider and transaction
            records;
          </li>

          <li>
            order, download, authentication,
            and security logs;
          </li>

          <li>
            whether purchased files were
            accessed;
          </li>

          <li>
            the applicable beat listing and
            license;
          </li>

          <li>
            communications between the buyer,
            producer, and BeatMarket;
          </li>

          <li>
            suspected fraud, abuse,
            chargebacks, or unauthorized use;
          </li>

          <li>
            ownership, copyright, and licensing
            claims.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket may approve, reject,
          partially approve, or place a request
          into manual review depending on the
          available evidence and payment
          provider response.
        </p>
      </LegalSection>

      <LegalSection title="7. Partial refunds">
        <p style={{ margin: 0 }}>
          When an order contains multiple
          items, BeatMarket may refund only the
          affected item or amount rather than
          the entire order.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A partial refund may proportionally
          adjust platform fees, producer
          earnings, licenses, and access
          associated with the refunded item.
        </p>
      </LegalSection>

      <LegalSection title="8. Refund processing">
        <p style={{ margin: 0 }}>
          Approved refunds are submitted
          through the applicable payment
          provider. BeatMarket does not control
          the time required by banks, card
          networks, or payment providers to
          return funds.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A refund is considered completed only
          after the payment provider confirms
          the refund and BeatMarket records the
          successful result.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          When a provider response is
          incomplete, inconsistent, delayed, or
          uncertain, BeatMarket may place the
          refund into manual review before
          making further changes.
        </p>
      </LegalSection>

      <LegalSection title="9. Effect of a completed refund">
        <p style={{ margin: 0 }}>
          After a refund is completed:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            access to the refunded files may be
            revoked;
          </li>

          <li>
            related download links may stop
            working;
          </li>

          <li>
            the refunded license is cancelled
            to the extent permitted by law;
          </li>

          <li>
            the buyer must stop using,
            distributing, publishing, or
            monetizing the refunded beat;
          </li>

          <li>
            producer earnings and platform
            fees connected to the refund may be
            reversed or adjusted;
          </li>

          <li>
            the order, refund, and financial
            records remain stored for
            accounting, security, dispute, and
            legal purposes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Buyer obligations after a refund">
        <p style={{ margin: 0 }}>
          Unless applicable law provides
          otherwise, a buyer receiving a refund
          must delete all copies of the
          refunded files under their control
          and stop using material created under
          the cancelled license.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A refund does not authorize continued
          use of the beat without a valid
          license.
        </p>
      </LegalSection>

      <LegalSection title="11. Chargebacks and payment disputes">
        <p style={{ margin: 0 }}>
          Buyers should contact BeatMarket
          before initiating a chargeback when
          reasonably possible so the issue can
          be investigated.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A chargeback, reversal, or payment
          dispute may result in suspension of
          download access, cancellation of the
          associated license, restriction of
          the account, and preservation of
          transaction evidence.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Fraudulent or abusive chargebacks may
          lead to account suspension or other
          action permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="12. Producer adjustments">
        <p style={{ margin: 0 }}>
          When a completed refund affects a
          producer&apos;s sale, BeatMarket may
          reverse pending, available, reserved,
          or unpaid earnings associated with
          the refunded transaction.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          If funds have already been paid out,
          BeatMarket may record a negative
          balance, offset future earnings, or
          take another lawful recovery action
          permitted by the marketplace terms.
        </p>
      </LegalSection>

      <LegalSection title="13. Fraud and abuse">
        <p style={{ margin: 0 }}>
          BeatMarket may reject, delay, or
          investigate a refund request when
          there is evidence of:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            repeated or excessive refund
            requests;
          </li>

          <li>
            unauthorized account access;
          </li>

          <li>
            manipulated payment or transaction
            information;
          </li>

          <li>
            downloading files before falsely
            claiming non-delivery;
          </li>

          <li>
            continued use of a beat after a
            refund;
          </li>

          <li>
            collusion between marketplace
            participants;
          </li>

          <li>
            other fraudulent, deceptive, or
            abusive conduct.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="14. Rights required by law">
        <p style={{ margin: 0 }}>
          Nothing in this Policy limits
          non-waivable consumer rights or other
          protections that apply under
          applicable law.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Where this Policy conflicts with a
          mandatory legal requirement, the
          legal requirement will control.
        </p>
      </LegalSection>

      <LegalSection title="15. Policy changes">
        <p style={{ margin: 0 }}>
          BeatMarket may update this Refund
          Policy as marketplace features,
          payment-provider processes, or legal
          requirements change.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          The current update date will appear
          at the top of this page.
        </p>
      </LegalSection>

      <LegalSection title="16. Contact">
        <p style={{ margin: 0 }}>
          Refund requests and questions should
          be submitted through
          BeatMarket&apos;s official support
          channel with the relevant order and
          account information.
        </p>
      </LegalSection>
    </LegalPage>
  );
}