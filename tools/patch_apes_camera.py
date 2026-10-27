"""Make Apes vs Helium's weapon camera draw the level as well as the weapon.

Requires UnityPy (`python3 -m pip install UnityPy`). The WebGL build's gameplay
camera leaves the world black on some browsers, while the weapon camera still
renders. Drawing both layers with the weapon camera restores the level.

Usage: python3 tools/patch_apes_camera.py INPUT/assets.zip OUTPUT/assets.zip
"""

import struct
import sys
import zipfile

import UnityPy


PART_PREFIX = "Build/AVHPort.data.unityweb.part"
PART_SIZE = 19_922_944
MAGIC = b"UnityWebData1.0\0"


def patch_bundle(data):
    environment = UnityPy.load(data)
    bundle = next(iter(environment.files.values()))
    for level in ("level1", "level2", "level3"):
        scene = bundle.files[level]
        cameras = [
            obj for obj in scene.objects.values()
            if obj.type.name == "Camera"
            and obj.read().m_GameObject.read().m_Name in ("Weapon", "FirstPersonCharacter")
        ]
        weapon = next(obj for obj in cameras if obj.read().m_GameObject.read().m_Name == "Weapon")
        world = next(obj for obj in cameras if obj.read().m_GameObject.read().m_Name == "FirstPersonCharacter")
        weapon_data = weapon.read_typetree(check_read=False)
        world_data = world.read_typetree(check_read=False)
        weapon_data["m_CullingMask"]["m_Bits"] |= world_data["m_CullingMask"]["m_Bits"]
        weapon_data["m_ClearFlags"] = world_data["m_ClearFlags"]
        weapon.save_typetree(weapon_data)
    return bundle.save("original")


def patch_zip(source, target):
    with zipfile.ZipFile(source) as incoming:
        content = b"".join(incoming.read(PART_PREFIX + str(i)) for i in range(1, 4))
        if not content.startswith(MAGIC):
            raise ValueError("Unexpected Unity Web Data header")
        header_size = struct.unpack_from("<I", content, 16)[0]
        position = 20
        entries = []
        while position < header_size:
            offset, size, name_size = struct.unpack_from("<III", content, position)
            position += 12
            name = content[position:position + name_size]
            position += name_size
            data = content[offset:offset + size]
            if name == b"data.unity3d":
                data = patch_bundle(data)
            entries.append((name, data))

        header = bytearray(MAGIC + b"\0" * 4)
        offset = len(header) + sum(12 + len(name) for name, _ in entries)
        for name, data in entries:
            header.extend(struct.pack("<III", offset, len(data), len(name)))
            header.extend(name)
            offset += len(data)
        struct.pack_into("<I", header, 16, len(header))
        content = bytes(header) + b"".join(data for _, data in entries)

        with zipfile.ZipFile(target, "w") as outgoing:
            for info in incoming.infolist():
                if info.filename.startswith(PART_PREFIX):
                    part = int(info.filename[len(PART_PREFIX):])
                    start = (part - 1) * PART_SIZE
                    data = content[start:start + PART_SIZE] if part < 3 else content[start:]
                else:
                    data = incoming.read(info)
                outgoing.writestr(info, data)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    patch_zip(sys.argv[1], sys.argv[2])
