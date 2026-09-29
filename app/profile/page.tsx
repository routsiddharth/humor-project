import { saveProfile } from "@/app/profile/actions";
import { ProfileForm } from "@/components/profile-form";
import { requireCompleteProfile } from "@/lib/auth";
import { avatarUrl, initials } from "@/lib/avatar";

export const metadata = { title: "Profile · humor-project" };

export default async function ProfilePage() {
  const { user, profile } = await requireCompleteProfile("/profile");

  return (
    <main className="page page--narrow">
      <header className="page__head">
        <h1 className="page__title">Profile</h1>
        <p className="page__sub">
          Signed in with Google as {user.email}.
        </p>
      </header>

      <div className="panel">
        <ProfileForm
          submitAction={saveProfile}
          firstName={profile.first_name ?? ""}
          lastName={profile.last_name ?? ""}
          initials={initials(profile.first_name, profile.last_name)}
          currentAvatarUrl={avatarUrl(profile.avatar_path)}
          submitLabel="Save changes"
        />
        <p className="panel__foot">
          Photos live in Supabase Storage. The database stores only the object
          path.
        </p>
      </div>
    </main>
  );
}
