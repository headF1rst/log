import React from "react";
import { IProfile } from "../lib/types";
import { AiFillGithub } from "react-icons/ai";
import { MdEmail } from "react-icons/md";

interface SideProfileProps extends IProfile {
  lang?: string;
}

function SideProfile({ name, description, email, github, image, lang }: SideProfileProps) {
  return (
    <div className="p-10 lg:fixed lg:top-50 lg:right-0 lg:h-full lg:w-1/5 dark:text-[#c9d1d9] sm:flex sm:gap-4">
      <div className="sm:w-20 sm:h-20 sm:m-2 sm:my-auto">
        <img
          className="rounded-full lg:w-full object-cover"
          src={image}
          width={180}
          height={180}
          alt="프로필 사진"
        />
      </div>
      <div className="flex flex-col gap-2 mt-5">
        <span className="text-xl mr-2">{name}</span>
        <div className="text-sm">{description}</div>
        <hr />
        <div className="flex gap-2">
          <a
            href={`https://github.com/${github}`}
            className="hover:underline hover:text-indigo-400"
          >
            <AiFillGithub size={27} />
          </a>

          <a
            href={`mailto:${email}`}
            className="hover:underline hover:text-indigo-400"
          >
            <MdEmail size={27} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default SideProfile;
