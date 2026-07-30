import LegalPage, {
  LegalSection,
} from '@/components/LegalPage';

export const metadata = {
  title: 'Terms of Service',
  description:
    'Terms governing access to and use of BeatMarket.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="July 30, 2026"
    >
      <p
        style={{
          margin: 0,
          color: '#374151',
        }}
      >
        These Terms of Service govern your
        access to and use of BeatMarket,
        including its marketplace, accounts,
        payment features, beat uploads,
        licenses, downloads, and related
        services.
      </p>

      <p
        style={{
          margin: '18px 0 0',
          color: '#374151',
        }}
      >
        By creating an account, uploading a
        beat, purchasing a license, or
        otherwise using BeatMarket, you agree
        to these Terms.
      </p>

      <LegalSection title="1. Eligibility">
        <p style={{ margin: 0 }}>
          You must be legally capable of
          entering into a binding agreement
          under the laws that apply to you.
          When using BeatMarket on behalf of
          a business or organization, you
          confirm that you have authority to
          bind that entity to these Terms.
        </p>
      </LegalSection>

      <LegalSection title="2. User accounts">
        <p style={{ margin: 0 }}>
          You are responsible for providing
          accurate account information,
          protecting your login credentials,
          and all activity performed through
          your account.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          You must promptly notify BeatMarket
          if you believe your account has
          been accessed without permission.
          You may not sell, transfer, share,
          or misuse another person&apos;s
          account.
        </p>
      </LegalSection>

      <LegalSection title="3. Marketplace role">
        <p style={{ margin: 0 }}>
          BeatMarket provides technology that
          allows producers to offer beats and
          buyers to purchase licenses. Unless
          expressly stated otherwise,
          BeatMarket is not the creator,
          owner, or publisher of beats
          uploaded by producers.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Producers are responsible for their
          uploaded content, pricing,
          descriptions, ownership claims, and
          compliance with applicable law.
          Buyers are responsible for
          reviewing the applicable license
          terms before using a purchased
          beat.
        </p>
      </LegalSection>

      <LegalSection title="4. Producer responsibilities">
        <p style={{ margin: 0 }}>
          By uploading or publishing a beat,
          a producer confirms that they own
          or control all rights necessary to
          offer that beat and its associated
          files through BeatMarket.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Producers must not upload content
          that:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            infringes copyright, trademark,
            privacy, publicity, or other
            rights;
          </li>

          <li>
            contains unauthorized samples,
            loops, vocals, recordings, or
            other protected material;
          </li>

          <li>
            is unlawful, fraudulent,
            misleading, harmful, or
            malicious;
          </li>

          <li>
            contains malware, corrupted
            files, or code intended to
            interfere with BeatMarket.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Purchases and payments">
        <p style={{ margin: 0 }}>
          Prices are displayed before
          checkout. Payments may be processed
          by a third-party payment provider.
          By submitting payment information,
          you authorize the payment provider
          to process the transaction.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A purchase is completed only after
          payment has been confirmed and the
          order has been successfully
          recorded by BeatMarket.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket may refuse, cancel,
          suspend, or review a transaction
          when fraud, payment failure,
          pricing error, duplicate
          processing, technical failure, or
          unauthorized activity is
          suspected.
        </p>
      </LegalSection>

      <LegalSection title="6. Beat licenses">
        <p style={{ margin: 0 }}>
          Purchasing a beat does not
          automatically transfer copyright
          ownership unless the applicable
          license expressly states otherwise.
          The buyer receives only the rights
          described in the license attached
          to the purchase.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Buyers must comply with all usage,
          distribution, credit, monetization,
          modification, and exclusivity
          limits stated in the applicable
          license.
        </p>
      </LegalSection>

      <LegalSection title="7. Exclusive licenses">
        <p style={{ margin: 0 }}>
          When an Exclusive license is
          offered, BeatMarket may temporarily
          reserve the beat while payment is
          being processed. A failed,
          abandoned, expired, or cancelled
          transaction may release that
          reservation.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          After a valid Exclusive purchase is
          completed, future availability may
          be restricted according to the
          applicable license and marketplace
          rules.
        </p>
      </LegalSection>

      <LegalSection title="8. Downloads and access">
        <p style={{ margin: 0 }}>
          Download access is provided only
          for valid purchases associated with
          the authenticated buyer account.
          Download links and purchased files
          may not be shared, resold,
          redistributed, or used outside the
          applicable license.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Access may be restricted when an
          order is refunded, reversed,
          disputed, cancelled, fraudulent, or
          otherwise invalid.
        </p>
      </LegalSection>

      <LegalSection title="9. Refunds">
        <p style={{ margin: 0 }}>
          Refund requests are handled under
          the BeatMarket Refund Policy.
          Because digital files may become
          accessible immediately after
          purchase, refunds are not guaranteed
          merely because a buyer changes
          their mind.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          When a refund is completed,
          associated download access,
          licenses, producer earnings, and
          marketplace records may be
          cancelled, reversed, or adjusted.
        </p>
      </LegalSection>

      <LegalSection title="10. Fees and producer earnings">
        <p style={{ margin: 0 }}>
          BeatMarket may deduct disclosed
          platform fees, commissions,
          payment-related charges, refunds,
          reversals, or other authorized
          adjustments before producer
          earnings become payable.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Producer earnings may remain
          pending for a holding period before
          becoming available for payout.
          BeatMarket may delay or withhold a
          payout while investigating fraud,
          disputes, chargebacks, ownership
          claims, technical errors, or legal
          requirements.
        </p>
      </LegalSection>

      <LegalSection title="11. Prohibited conduct">
        <p style={{ margin: 0 }}>
          You may not:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            use BeatMarket for unlawful,
            deceptive, or fraudulent
            purposes;
          </li>

          <li>
            interfere with the security,
            availability, or operation of the
            service;
          </li>

          <li>
            attempt to bypass authentication,
            payment, download, storage, or
            access controls;
          </li>

          <li>
            scrape, copy, reverse engineer,
            overload, or probe the service
            without authorization;
          </li>

          <li>
            manipulate purchases, payouts,
            reviews, accounts, or marketplace
            activity;
          </li>

          <li>
            impersonate another person or
            misrepresent ownership of
            content.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="12. Intellectual property">
        <p style={{ margin: 0 }}>
          BeatMarket&apos;s software, design,
          branding, text, interface, and
          platform materials are protected by
          intellectual property laws and may
          not be copied, modified,
          distributed, or commercially used
          without permission.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Producers retain ownership of their
          beats except for rights they grant
          to buyers and the limited rights
          required for BeatMarket to host,
          display, stream, promote, process,
          and deliver their content.
        </p>
      </LegalSection>

      <LegalSection title="13. Content removal and account suspension">
        <p style={{ margin: 0 }}>
          BeatMarket may remove content,
          restrict features, suspend an
          account, cancel marketplace access,
          or preserve relevant records when
          reasonably necessary to address
          suspected violations, disputes,
          security risks, legal claims, or
          harm to users or the platform.
        </p>
      </LegalSection>

      <LegalSection title="14. Service availability">
        <p style={{ margin: 0 }}>
          BeatMarket may change, maintain,
          suspend, or discontinue any feature
          of the service. Continuous,
          uninterrupted, or error-free
          availability is not guaranteed.
        </p>
      </LegalSection>

      <LegalSection title="15. Disclaimers">
        <p style={{ margin: 0 }}>
          BeatMarket is provided on an
          &quot;as is&quot; and &quot;as
          available&quot; basis to the extent
          permitted by applicable law.
          BeatMarket does not guarantee that
          every producer owns all claimed
          rights, that every beat will meet a
          buyer&apos;s requirements, or that
          third-party services will always
          remain available.
        </p>
      </LegalSection>

      <LegalSection title="16. Limitation of liability">
        <p style={{ margin: 0 }}>
          To the maximum extent permitted by
          applicable law, BeatMarket will not
          be liable for indirect, incidental,
          special, consequential, exemplary,
          or punitive damages, or for lost
          profits, revenue, data, reputation,
          opportunities, or business arising
          from use of the service.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Nothing in these Terms excludes or
          limits liability that cannot
          lawfully be excluded or limited.
        </p>
      </LegalSection>

      <LegalSection title="17. Indemnification">
        <p style={{ margin: 0 }}>
          To the extent permitted by law, you
          agree to defend, indemnify, and hold
          BeatMarket harmless from claims,
          losses, liabilities, costs, and
          expenses arising from your content,
          your use of the service, your breach
          of these Terms, or your violation
          of another person&apos;s rights.
        </p>
      </LegalSection>

      <LegalSection title="18. Changes to these Terms">
        <p style={{ margin: 0 }}>
          BeatMarket may update these Terms
          as the marketplace, legal
          requirements, or service features
          change. The updated date will be
          shown at the top of this page.
          Continued use after an update means
          you accept the revised Terms to the
          extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="19. Severability">
        <p style={{ margin: 0 }}>
          If any provision of these Terms is
          found unenforceable, the remaining
          provisions will continue to apply.
        </p>
      </LegalSection>

      <LegalSection title="20. Contact">
        <p style={{ margin: 0 }}>
          Questions, complaints, ownership
          claims, and legal notices concerning
          these Terms should be submitted
          through BeatMarket&apos;s official
          support or contact channel.
        </p>
      </LegalSection>
    </LegalPage>
  );
}